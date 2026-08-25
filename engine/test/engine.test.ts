import { describe, expect, it } from "vitest";
import {
  ABUNDANCE_PRIOR, Model, PDV2_WEIGHTS, balance, buildProblem, evaluate, greedy, massOf, signalTolerance,
} from "../src/index";
import type { Row } from "../src/index";
import { loadBundle, syntheticProblem } from "./util";

const bundle = loadBundle();

describe("PO math (guide formulas)", () => {
  // 141Pr oxide -> 157Gd at 2.5 %: SO = S * PO / 100.
  const rows: Row[] = [
    { id: "bright", label: "CD45", signal: 1000, tolerance: 10, domain: [141], locked: 141 },
    { id: "dim", label: "CCR7", signal: 50, tolerance: 5, domain: [157], locked: 157 },
  ];
  const pct = { 141: { 157: 2.5 }, 157: { 158: 0.8, 156: 0.4 } };

  it("received SO = S_donor x PO / 100 and objective = sum received / T", () => {
    const res = evaluate(syntheticProblem([141, 157, 158], pct, rows), { bright: 141, dim: 157 });
    const dim = res.rows.find((r) => r.rowId === "dim")!;
    expect(dim.received).toBeCloseTo(25, 9);
    expect(dim.receivedOverT).toBeCloseTo(5, 9);
    expect(dim.contributions[0]).toMatchObject({ rowId: "bright", mass: 141, mechanism: "oxide", pct: 2.5 });
    expect(res.objective).toBeCloseTo(5, 9); // bright receives nothing
    expect(res.score).toBeCloseTo(5, 9); // no soft terms in the synthetic problem
    const w = res.warnings.find((x) => x.code === "spillover")!;
    expect(w.severity).toBe("critical");
    expect(w.message).toContain("CCR7");
    expect(w.message).toContain("CD45");
  });

  it("group exclusivity zeroes spillover between disjoint groups", () => {
    const grouped = rows.map((r, i) => ({ ...r, groups: [i === 0 ? "T" : "B"] }));
    const res = evaluate(syntheticProblem([141, 157, 158], pct, grouped), { bright: 141, dim: 157 });
    expect(res.objective).toBe(0);
    const shared = rows.map((r) => ({ ...r, groups: ["T", "all"] }));
    expect(evaluate(syntheticProblem([141, 157, 158], pct, shared), { bright: 141, dim: 157 }).objective).toBeCloseTo(5, 9);
  });

  it("w_oxide scales only M+16 cells of the effective matrix", () => {
    const p = syntheticProblem([141, 157, 158], pct, rows, { weights: { w_sens: 0, w_flagged: 0, w_oxide: 1 } });
    const m = new Model(p);
    const d = m.massIndex.get(141)!, r = m.massIndex.get(157)!, r2 = m.massIndex.get(158)!;
    expect(m.frac[d][r]).toBeCloseTo(0.05, 12);
    expect(m.rawFrac[d][r]).toBeCloseTo(0.025, 12);
    expect(m.frac[r][r2]).toBeCloseTo(0.008, 12); // adjacent, not scaled
  });
});

describe("optimiser", () => {
  it("moves the dim marker out of the oxide channel when it can", () => {
    const rows: Row[] = [
      { id: "bright", label: "CD45", signal: 1000, tolerance: 10, domain: [141, 165] },
      { id: "dim", label: "CCR7", signal: 50, tolerance: 5, domain: [157, 165] },
    ];
    const res = balance(syntheticProblem([141, 157, 165], { 141: { 157: 2.5 } }, rows), { seed: 3 });
    expect(res.objective).toBe(0);
    expect(res.unassigned).toEqual([]);
    expect(new Set(Object.values(res.assignment)).size).toBe(2);
  });

  it("respects locks, reserved channels and domains", () => {
    const rows: Row[] = [
      { id: "a", label: "A", signal: 100, tolerance: 10, domain: [141, 157], locked: 141 },
      { id: "b", label: "B", signal: 100, tolerance: 10, domain: [157, 165] },
      { id: "c", label: "C", signal: 100, tolerance: 10, domain: [165, 191] },
    ];
    const res = balance(syntheticProblem([141, 157, 165, 191], {}, rows, { reserved: [191] }));
    expect(res.assignment.a).toBe(141);
    expect(res.assignment.c).toBe(165);
    expect(res.assignment.b).toBe(157);
    expect(res.rows.find((r) => r.rowId === "a")!.locked).toBe(true);
  });

  it("finds a perfect matching via augmenting paths when greedy order would block it", () => {
    // 'wide' is dimmer so greedy places it first and would grab 141; 'narrow' only fits 141.
    const rows: Row[] = [
      { id: "wide", label: "W", signal: 100, tolerance: 1, domain: [141, 157, 165] },
      { id: "narrow", label: "N", signal: 100, tolerance: 50, domain: [141] },
      { id: "mid", label: "M", signal: 100, tolerance: 20, domain: [141, 157] },
    ];
    const p = syntheticProblem([141, 157, 165], { 141: { 157: 3 }, 157: { 141: 3 } }, rows);
    const seed = greedy(new Model(p));
    expect([...seed]).not.toContain(-1);
    const res = balance(p);
    expect(res.unassigned).toEqual([]);
    expect(res.assignment.narrow).toBe(141);
  });

  it("reports rows that genuinely cannot be placed", () => {
    const rows: Row[] = [
      { id: "a", label: "A", signal: 100, tolerance: 10, domain: [141] },
      { id: "b", label: "B", signal: 100, tolerance: 10, domain: [141] },
    ];
    const res = balance(syntheticProblem([141, 157], {}, rows));
    expect(res.unassigned.length).toBe(1);
    expect(res.warnings[0]).toMatchObject({ severity: "critical", code: "unassigned" });
  });

  it("is deterministic for a seed and never worse than greedy", () => {
    const rows: Row[] = Array.from({ length: 25 }, (_, i) => ({
      id: `r${i}`, label: `R${i}`, signal: 30 + ((i * 97) % 600), tolerance: 3 + ((i * 31) % 60),
      domain: bundle.instruments[0].channels.filter((c) => c.usable && (c.mass + i) % 3 !== 0).map((c) => c.mass),
    }));
    const p = buildProblem(bundle, { instrumentId: "cytof_xt", rows: rows.map((r) => ({ ...r, metals: r.domain })) });
    const a = balance(p, { seed: 11 });
    const b = balance(p, { seed: 11 });
    expect(a.assignment).toEqual(b.assignment);
    expect(a.score).toBeLessThanOrEqual(a.stats.greedyScore + 1e-9);
    expect(a.unassigned).toEqual([]);
    expect(new Set(Object.values(a.assignment)).size).toBe(25);
    for (const r of a.rows) expect([191, 193]).not.toContain(r.mass); // hard reserved on suspension
  });
});

describe("problem builder and prior", () => {
  it("applies default reserved roles and the abundance prior", () => {
    const p = buildProblem(bundle, {
      modality: "suspension",
      rows: [
        { id: "x", label: "X", level: "low", metals: ["162Dy", "141Pr"] },
        { id: "y", label: "Y", signal: 100, tolerance: 1, level: "high", metals: [89], allowCustom: true },
        { id: "z", label: "Z", signal: 250, tolerance: 30, metals: ["165Ho"], locked: "165Ho" },
      ],
    });
    expect(p.instrument.id).toBe("cytof_xt");
    expect(p.reserved).toEqual([191, 193]);
    expect(p.flagged).toEqual([194, 195, 198]);
    expect(p.rows[0]).toMatchObject({ signal: ABUNDANCE_PRIOR.low.signal, tolerance: ABUNDANCE_PRIOR.low.tolerance, domain: [141, 162] });
    expect(p.rows[1].signal).toBe(ABUNDANCE_PRIOR.high.signal); // 100/1 placeholder ignored
    expect(p.rows[1].domain).toContain(112); // MCP9 Cd on suspension
    expect(p.rows[1].domain).toContain(176);
    expect(p.rows[2].locked).toBe(165);
  });

  it("imaging problems reserve the segmentation kit and exclude Cd from custom domains", () => {
    const p = buildProblem(bundle, { modality: "imaging", rows: [{ id: "x", label: "X", allowCustom: true }] });
    expect(p.instrument.id).toBe("hyperion_xti");
    expect(p.reserved).toEqual([191, 193, 195, 196, 198]);
    expect(p.rows[0].domain.some((m) => m >= 106 && m <= 116)).toBe(false);
  });

  it("helpers", () => {
    expect(massOf("145ND")).toBe(145);
    expect(massOf("Custom")).toBeNull();
    expect(signalTolerance({ signal: 420, tolerance: 12 }, "low")).toMatchObject({ signal: 420, tolerance: 12, source: "titrated" });
    expect(signalTolerance(null, null).source).toBe("default");
  });
});

describe("real instrument sanity", () => {
  it("a bright CD45 on 141Pr hurts a dim marker on 157Gd on the CyTOF XT, and evaluate() suggests a fix", () => {
    const p = buildProblem(bundle, {
      instrumentId: "cytof_xt", weights: PDV2_WEIGHTS,
      rows: [
        { id: "cd45", label: "CD45", signal: 900, tolerance: 120, metals: ["141Pr", "89Y"] },
        { id: "ccr7", label: "CCR7", signal: 30, tolerance: 5, metals: ["157Gd"] },
      ],
    });
    const kit = evaluate(p, { cd45: 141, ccr7: 157 });
    const ccr7 = kit.rows.find((r) => r.rowId === "ccr7")!;
    expect(ccr7.contributions[0].mechanism).toBe("oxide");
    expect(ccr7.receivedOverT).toBeGreaterThan(0.5);
    const w = kit.warnings.find((x) => x.code === "spillover")!;
    expect(w.fix).toBeDefined();
    expect(w.fix!.message).toContain("89Y");
    const best = balance(p);
    expect(best.assignment.cd45).toBe(89);
    expect(best.objective).toBeLessThan(kit.objective);
  });
});
