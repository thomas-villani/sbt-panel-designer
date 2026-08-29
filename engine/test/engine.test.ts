import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ABUNDANCE_PRIOR, ENGINE_VERSION, PDV2_WEIGHTS, SPILL_CRIT, SPILL_WARN, balance, buildProblem,
  canCarryAntibody, evaluate, massOf, signalTolerance,
} from "../src/index";
import { Model, channelUniverse, greedy } from "../src/internal";
import type { ChannelDef, Row } from "../src/index";
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
    expect(p.rows[1].domain).toContain(112); // Cd on suspension
    expect(p.rows[1].domain).toContain(176);
    expect(p.rows[1].domain).toContain(197); // 197Au is on SBT's CyTOF conjugation list
    expect(p.rows[1].domain).not.toContain(157); // no conjugation metal is sold for 157Gd
    expect(p.rows[2].locked).toBe(165);
  });

  it("imaging problems reserve the segmentation kit and exclude Cd from custom domains", () => {
    const p = buildProblem(bundle, { modality: "imaging", rows: [{ id: "x", label: "X", allowCustom: true }] });
    expect(p.instrument.id).toBe("hyperion_xti");
    expect(p.reserved).toEqual([191, 193, 195, 196, 198]);
    for (const m of [106, 110, 111, 112, 113, 114, 116]) expect(p.rows[0].domain).not.toContain(m); // no Cd on IMC
    expect(p.rows[0].domain).toContain(115); // 115In is on the IMC list
    expect(p.rows[0].domain).toContain(209);
    for (const m of [157, 194, 197]) expect(p.rows[0].domain).not.toContain(m); // detected, but not an IMC conjugation metal
    expect(p.rows[0].domain).toHaveLength(41); // every IMC conjugation metal; reserved Pt is excluded by the model, not the domain
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

const CD_MASSES = [106, 110, 111, 112, 113, 114, 116];

describe("channel universe (one rule)", () => {
  it("canCarryAntibody: detected + a conjugation metal, or a mass the user opted into", () => {
    const ch = (mass: number, usable: boolean, antibody?: boolean): ChannelDef =>
      ({ mass, element: "X", label: `${mass}X`, rel_sensitivity: 1, usable, antibody, in_po_matrix: true, range_class: "mid" });
    expect(canCarryAntibody(ch(162, true))).toBe(true);
    expect(canCarryAntibody(ch(157, true, false))).toBe(false);
    expect(canCarryAntibody(ch(157, true, false), [157])).toBe(true);
    expect(canCarryAntibody(ch(157, false, false), [157])).toBe(false); // opting in cannot invent a detector
    expect(canCarryAntibody(ch(113, true, false), new Set([113]))).toBe(true);
  });

  it("the model fills opted-in Cd channels on IMC, and cannot fill them without the opt-in", () => {
    const rows = Array.from({ length: 46 }, (_, i) => ({ id: `r${i}`, label: `R${i}`, level: "medium" as const, allowCustom: true }));
    const plain = buildProblem(bundle, { modality: "imaging", rows });
    const opted = buildProblem(bundle, { modality: "imaging", rows, extraMetals: CD_MASSES });
    expect(channelUniverse(plain)).toHaveLength(38);
    expect(channelUniverse(opted)).toHaveLength(45); // + 7 Cd
    expect(opted.extraMetals).toEqual(CD_MASSES);

    const before = balance(plain, { seed: 1 });
    const after = balance(opted, { seed: 1 });
    expect(Object.values(before.assignment).filter((m) => CD_MASSES.includes(m))).toEqual([]);
    expect(Object.values(after.assignment).filter((m) => CD_MASSES.includes(m))).toHaveLength(7);
    expect(after.unassigned.length).toBeLessThan(before.unassigned.length);
  });

  it("a lock on an opted-in metal is not a reserved_lock; other locks say why", () => {
    const lock = (extraMetals?: number[]) => balance(buildProblem(bundle, {
      modality: "imaging", extraMetals, rows: [{ id: "x", label: "X", level: "medium", locked: 113 }],
    }));
    expect(lock().warnings.find((w) => w.code === "reserved_lock")).toMatchObject({ reason: "blocked" });
    expect(lock(CD_MASSES).warnings.find((w) => w.code === "reserved_lock")).toBeUndefined();
    expect(lock(CD_MASSES).assignment.x).toBe(113);

    const reasonFor = (locked: number) => balance(buildProblem(bundle, {
      instrumentId: "cytof_xt", rows: [{ id: "x", label: "X", level: "medium", locked }],
    })).warnings.find((w) => w.code === "reserved_lock")?.reason;
    expect(reasonFor(191)).toBe("role"); // hard-reserved DNA channel
    expect(reasonFor(157)).toBe("blocked"); // detected, but no conjugation metal is sold
    expect(reasonFor(300)).toBe("undetected"); // not a channel at all
  });
});

describe("build options and boundary validation", () => {
  it("extraReserved keeps rows off a blocked channel", () => {
    const p = buildProblem(bundle, {
      instrumentId: "cytof_xt", extraReserved: [141],
      rows: [{ id: "x", label: "X", level: "medium", metals: ["141Pr", "142Nd"] }],
    });
    expect(p.reserved).toContain(141);
    expect(balance(p).assignment.x).toBe(142);
  });

  it("unreserve releases a mass from both reserved and flagged", () => {
    const rows = [{ id: "x", label: "X", level: "medium" as const, metals: [195] }];
    const kept = buildProblem(bundle, { instrumentId: "cytof_xt", rows });
    expect(kept.flagged).toEqual([194, 195, 198]);
    expect(balance(kept).warnings.some((w) => w.code === "flagged_channel")).toBe(true);

    const freed = buildProblem(bundle, { instrumentId: "cytof_xt", rows, unreserve: [195, 191] });
    expect(freed.flagged).toEqual([194, 198]);
    expect(freed.reserved).toEqual([193]);
    expect(balance(freed).warnings.some((w) => w.code === "flagged_channel")).toBe(false);
  });

  it("rejects an unknown modality, unknown reserved roles and duplicate row ids", () => {
    expect(() => buildProblem(bundle, { modality: "flow" as never, rows: [] }))
      .toThrow(/no current instrument for modality "flow"/);
    expect(() => buildProblem(bundle, { modality: "suspension", reservedRoles: ["dna_intercalator", "nope", "also_nope"], rows: [] }))
      .toThrow(/unknown reserved role\(s\) for suspension: nope, also_nope/);
    expect(() => buildProblem(bundle, {
      modality: "suspension", rows: [{ id: "x", label: "A" }, { id: "x", label: "B" }, { id: "y", label: "C" }],
    })).toThrow(/duplicate row id\(s\): x/);
    expect(() => buildProblem(bundle, { instrumentId: "nope", rows: [] })).toThrow(/unknown instrument "nope"/);
  });
});

describe("duplicate locks and invalid assignments", () => {
  const pinned: Row[] = [
    { id: "a", label: "A", signal: 100, tolerance: 10, domain: [141, 157], locked: 141 },
    { id: "b", label: "B", signal: 100, tolerance: 10, domain: [141, 157], locked: 141 },
  ];

  it("two rows pinned to one mass: the first keeps it, the second is unpinned, both are warned", () => {
    const res = balance(syntheticProblem([141, 157], {}, pinned));
    expect(res.assignment.a).toBe(141);
    expect(res.assignment.b).toBe(157); // unpinned, so it moves rather than double-booking 141
    expect(res.rows.find((r) => r.rowId === "b")!.locked).toBe(false);
    const dup = res.warnings.filter((w) => w.code === "duplicate_lock");
    expect(dup.map((w) => w.rowId).sort()).toEqual(["a", "b"]);
    expect(dup.every((w) => w.severity === "critical")).toBe(true);
    expect(dup[0].message).toContain("141E");
  });

  it("evaluate() refuses a collision and an out-of-domain mass instead of placing them", () => {
    const free = pinned.map((r) => ({ ...r, locked: null }));
    const p = syntheticProblem([141, 157, 165], { 141: { 157: 2 } }, free);
    const clash = evaluate(p, { a: 141, b: 141 });
    expect(clash.assignment).toEqual({ a: 141 });
    expect(clash.unassigned).toEqual(["b"]);
    const w = clash.warnings.find((x) => x.rowId === "b")!;
    expect(w).toMatchObject({ code: "invalid_assignment", severity: "critical" });
    expect(w.message).toContain("already taken");

    const off = evaluate(p, { a: 165, b: 157 });
    expect(off.unassigned).toEqual(["a"]);
    expect(off.warnings.find((x) => x.rowId === "a")!.code).toBe("invalid_assignment");
    expect(off.assignment).toEqual({ b: 157 });
  });

  it("evaluate() still honours a pin on a channel outside the antibody universe", () => {
    const p = buildProblem(bundle, {
      instrumentId: "cytof_xt", rows: [{ id: "x", label: "X", level: "medium", metals: ["157Gd"], locked: "157Gd" }],
    });
    const res = evaluate(p, { x: 157 });
    expect(res.assignment.x).toBe(157);
    expect(res.warnings.find((w) => w.code === "invalid_assignment")).toBeUndefined();
  });
});

describe("warning thresholds and explanations", () => {
  // 100 % PO makes received == S exactly, so S/T lands on the threshold with no floating-point slack.
  const at = (signal: number) => {
    const rows: Row[] = [
      { id: "donor", label: "D", signal, tolerance: 50, domain: [141], locked: 141 },
      { id: "victim", label: "V", signal: 1, tolerance: 100, domain: [157], locked: 157 },
    ];
    const res = evaluate(syntheticProblem([141, 157], { 141: { 157: 100 } }, rows), { donor: 141, victim: 157 });
    return {
      overT: res.rows.find((r) => r.rowId === "victim")!.receivedOverT,
      w: res.warnings.find((x) => x.code === "spillover"),
    };
  };

  it("SPILL_WARN and SPILL_CRIT are inclusive lower bounds (0.99 / 1.0 / 1.99 / 2.0 of tolerance)", () => {
    expect([SPILL_WARN, SPILL_CRIT]).toEqual([1, 2]);
    expect(at(99).overT).toBeCloseTo(0.99, 12);
    expect(at(99).w).toBeUndefined();
    expect(at(100).w!.severity).toBe("warning");
    expect(at(199).w!.severity).toBe("warning");
    expect(at(200).w!.severity).toBe("critical");
  });

  it("unassigned rows report who holds each channel they asked for", () => {
    const rows: Row[] = [
      { id: "a", label: "A", signal: 100, tolerance: 10, domain: [141], locked: 141 },
      { id: "b", label: "B", signal: 100, tolerance: 10, domain: [141, 157] },
    ];
    const res = balance(syntheticProblem([141, 157], {}, rows, { reserved: [157] }));
    expect(res.unassigned).toEqual(["b"]);
    const w = res.warnings.find((x) => x.code === "unassigned")!;
    expect(w.blockedBy).toEqual([{ mass: 141, holderRowId: "a" }, { mass: 157, holderRowId: null }]);
  });
});

describe("versioning", () => {
  it("ENGINE_VERSION matches package.json and is stamped on every result", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(ENGINE_VERSION).toBe(pkg.version);
    const p = buildProblem(bundle, { instrumentId: "cytof_xt", rows: [{ id: "x", label: "X", level: "medium", metals: [141] }] });
    const res = balance(p);
    expect(res.engineVersion).toBe(ENGINE_VERSION);
    expect(evaluate(p, { x: 141 }).engineVersion).toBe(ENGINE_VERSION);
    expect(p.bundleVersion).toBe(bundle.version);
    expect(res.stats.converged).toBe(true);
  });
});
