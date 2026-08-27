/** panelHealth regroups engine residuals into decisions: budget, co-expression, acceptance. */
import { describe, expect, it } from "vitest";
import { balance, buildProblem } from "@pd3/engine";
import { panelHealth } from "@/lib/health";
import { reservedRoles, rowSpec } from "@/lib/data";
import type { PanelRow, Setup } from "@/lib/types";
import { index } from "./util";

const idx = index();
const setup: Setup = { modality: "suspension", species: "human", sampleType: "pbmc", instrumentId: "cytof_xt", viability: true, barcoding: false, segmentation: true, blocked: [] };
const row = (id: string, extra: Partial<PanelRow> = {}): PanelRow => {
  const clone = idx.cloneOptions(id, setup)[0]?.clone ?? null;
  return { id, targetId: id, name: idx.targetsById.get(id)?.name ?? id, level: "medium", clone, custom: !clone, locked: null, moduleIds: [], ...extra };
};
/** Pin two custom rows (any metal allowed) on a mass pair that actually spills: try M+16 (oxide) then M+1. */
const conflict = (a: PanelRow, b: PanelRow): { rows: PanelRow[]; res: ReturnType<typeof run> } => {
  const masses = idx.instrument(setup.instrumentId).channels.filter((c) => c.usable && c.antibody !== false).map((c) => c.mass);
  for (const gap of [16, 1]) for (const m of masses) {
    if (!masses.includes(m + gap)) continue;
    const rows = [{ ...a, clone: null, custom: true, level: "very_high" as const, locked: m }, { ...b, clone: null, custom: true, level: "low" as const, locked: m + gap }];
    const res = run(rows);
    if (res.warnings.some((w) => w.code === "spillover")) return { rows, res };
  }
  throw new Error("no spilling pair found");
};
const run = (rows: PanelRow[]) => balance(buildProblem(idx.bundles.instruments, {
  instrumentId: setup.instrumentId, rows: rows.map((r) => rowSpec(idx, r, setup)), reservedRoles: reservedRoles(setup), extraReserved: [],
}), { seed: 1 });

describe("panelHealth", () => {
  it("counts the overrun before any result exists and ranks whole modules by channels freed", () => {
    const lineage = idx.modulesById.get("human-pbmc-lineage")!;
    const rows: PanelRow[] = [];
    for (let i = 0; i < 60; i++) rows.push(row(`x${i}`, { targetId: null, name: `X${i}`, clone: null, custom: true, moduleIds: i < 10 ? [lineage.id] : [] }));
    const h = panelHealth(idx, setup, rows, null);
    expect(h.over).toBeGreaterThan(0);
    expect(h.tone).toBe("rose");
    expect(h.moduleDrops[0]).toMatchObject({ id: lineage.id, frees: 10 });
  });

  it("an accepted spillover leaves the to-do list and shows up under accepted", () => {
    // Force a conflict: two bright markers pinned one mass apart.
    const { rows, res } = conflict(row("cd45"), row("cd3e"));
    const h0 = panelHealth(idx, setup, rows, res);
    const spill = res.warnings.filter((w) => w.code === "spillover");
    expect(spill.length).toBeGreaterThan(0);
    const victim = spill[0].rowId;
    const h1 = panelHealth(idx, setup, rows.map((r) => (r.id === victim ? { ...r, accepted: "known, fine" } : r)), res);
    expect(h1.accepted.map((a) => a.w.rowId)).toContain(victim);
    expect(h1.conflicts.length + h1.checks.length).toBeLessThan(h0.conflicts.length + h0.checks.length);
  });

  it("spill between a cell type's positive and its lineage negative is filed as unlikely to matter", () => {
    // Some cell-type module must pair a positive with a negative; find one and pin the pair next to each other.
    const mod = idx.modulesFor(setup).find((m) => m.markers.some((k) => k.polarity === "neg" && k.target_id) && m.markers.some((k) => k.polarity !== "neg" && k.target_id))!;
    const pos = mod.markers.find((k) => k.polarity !== "neg" && k.target_id)!.target_id!;
    const neg = mod.markers.find((k) => k.polarity === "neg" && k.target_id)!.target_id!;
    const { rows, res } = conflict(row(pos), row(neg));
    const h = panelHealth(idx, setup, rows, res);
    const all = res.warnings.filter((w) => w.code === "spillover");
    expect(all.length).toBeGreaterThan(0);
    expect(h.unlikely.length).toBe(all.length);
    expect(h.conflicts).toEqual([]);
    expect(h.unlikely[0].why).toContain(mod.name);
  });
});

describe("kit-validated pairs", () => {
  it("spill between two markers of one SBT kit, both on their kit metals, is filed as validated (unlikely), not as a to-do", () => {
    const mdipa = idx.modulesById.get("direct-immune-profiling-assay-mdipa")!;
    const rows: PanelRow[] = mdipa.markers.filter((k) => k.target_id && k.mass != null).map((k) => ({
      id: k.target_id!, targetId: k.target_id, name: k.target_name, level: k.abundance_level ?? "medium", clone: k.clone, clonePinned: true, custom: false, locked: k.mass, moduleIds: [mdipa.id],
    }));
    const res = run(rows);
    expect(res.unassigned).toEqual([]);
    const h = panelHealth(idx, setup, rows, res);
    expect(h.conflicts).toEqual([]);
    expect(h.checks.filter((w) => w.code === "spillover")).toEqual([]);
    expect(h.unlikely.length).toBeGreaterThan(0);
    expect(h.unlikely[0].why).toMatch(/validated as a set/);
    expect(h.tone).toBe("emerald");
  });
});
