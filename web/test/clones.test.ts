/** Clone is a free variable unless pinned: the engine sees every catalogue clone's metals and the row lands on whichever clone fits. */
import { describe, expect, it } from "vitest";
import { resolveClones, rowMetals, rowSpec } from "@/lib/data";
import { useStore } from "@/lib/store";
import type { PanelRow, Setup } from "@/lib/types";
import { index } from "./util";

const idx = index();
const setup: Setup = { modality: "suspension", species: "human", sampleType: "pbmc", instrumentId: "cytof_xt", viability: true, barcoding: false, segmentation: true, blocked: [] };
const multi = idx.allTargets(setup).find((t) => idx.cloneOptions(t.id, setup).length > 1 && new Set(idx.cloneOptions(t.id, setup).flatMap((o) => o.metals)).size > idx.cloneOptions(t.id, setup)[0].metals.length)!;
const row = (extra: Partial<PanelRow> = {}): PanelRow => ({ id: multi.id, targetId: multi.id, name: multi.name, level: "medium", clone: idx.cloneOptions(multi.id, setup)[0].clone, custom: false, locked: null, moduleIds: [], ...extra });

describe("free clones", () => {
  it("a free row offers the union of every clone's metals; a pinned row only its own", () => {
    const free = rowSpec(idx, row(), setup);
    const pinned = rowSpec(idx, row({ clonePinned: true }), setup);
    expect(free.metals!.length).toBeGreaterThan(pinned.metals!.length);
    expect(rowMetals(idx, row(), setup)).toEqual([...(free.metals as number[])].sort((a, b) => a - b));
  });

  it("resolveClones swaps the clone to one sold on the assigned metal, and leaves pinned rows alone", () => {
    const opts = idx.cloneOptions(multi.id, setup);
    const other = opts.find((o) => o.conjugates.some((c) => !opts[0].conjugates.some((d) => d.mass === c.mass)))!;
    const mass = other.conjugates.find((c) => !opts[0].conjugates.some((d) => d.mass === c.mass))!.mass;
    const [r] = resolveClones(idx, [row()], { [multi.id]: mass }, setup);
    expect(r.clone).toBe(other.clone);
    const [p] = resolveClones(idx, [row({ clonePinned: true })], { [multi.id]: mass }, setup);
    expect(p.clone).toBe(opts[0].clone);
    const same = [row()];
    expect(resolveClones(idx, same, { [multi.id]: opts[0].conjugates[0].mass }, setup)).toBe(same); // identity when nothing changes
  });

  it("through the store: after a balance every free row's clone is sold on its channel; the drawer pin survives re-balancing", async () => {
    useStore.setState({ rows: [], result: null, balanced: false, step: "setup", setup });
    useStore.getState().init(idx.bundles);
    const s = useStore.getState();
    for (const t of idx.allTargets(setup).slice(0, 30)) s.addTarget(t.id);
    await s.balanceNow();
    const st = useStore.getState();
    for (const r of st.rows) {
      const mass = st.result!.assignment[r.id];
      if (mass == null || !r.clone) continue;
      expect(idx.candidates(r.targetId!, setup).some((c) => c.clone === r.clone && c.mass === mass)).toBe(true);
    }
    const target = st.rows.find((r) => r.targetId === multi.id) ?? st.rows[0];
    const alt = idx.cloneOptions(target.targetId!, setup)[1]?.clone;
    if (alt) {
      s.setClone(target.id, alt);
      await new Promise((r) => setTimeout(r, 500));
      expect(useStore.getState().rows.find((r) => r.id === target.id)).toMatchObject({ clone: alt, clonePinned: true });
      s.freeClone(target.id);
      expect(useStore.getState().rows.find((r) => r.id === target.id)!.clonePinned).toBe(false);
    }
  });
});
