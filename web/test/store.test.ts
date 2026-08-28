/** Store behaviour without a browser: the engine client falls back to the main thread when Worker is undefined. */
import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@/lib/store";
import { index } from "./util";

const idx = index();
const modules = (app: "imaging" | "suspension") => idx.modulesFor({ modality: app, species: "human", sampleType: app === "imaging" ? "ffpe" : "pbmc", instrumentId: "", viability: true, barcoding: false, segmentation: true, blocked: [] });

const until = async (ok: () => boolean, ms = 5000) => {
  const t0 = Date.now();
  while (!ok()) { if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 25)); }
};

beforeEach(() => {
  useStore.setState({ rows: [], result: null, balanced: false, step: "setup", setup: { modality: "suspension", species: "human", sampleType: "pbmc", instrumentId: "cytof_xt", viability: true, barcoding: false, segmentation: true, blocked: [] } });
  useStore.getState().init(idx.bundles);
});

describe("store", () => {
  it("adding a module upserts rows and tags them; removing it only drops rows that came from it alone", () => {
    const s = useStore.getState();
    const [a, b] = [modules("suspension").find((m) => m.id === "human-pbmc-lineage")!, modules("suspension").find((m) => m.id === "human-t-differentiation" ) ?? modules("suspension")[1]];
    s.addModule(a);
    const n = useStore.getState().rows.length;
    expect(n).toBeGreaterThan(5);
    s.addTarget("cd45");
    expect(useStore.getState().rows.length).toBe(n); // already present: no duplicate
    s.addModule(b);
    const shared = useStore.getState().rows.filter((r) => r.moduleIds.length === 2);
    s.removeModule(b.id);
    const after = useStore.getState().rows;
    expect(after.length).toBe(n);
    for (const r of shared) expect(after.find((x) => x.id === r.id)!.moduleIds).toEqual([a.id]);
  });

  it("switching modality re-resolves clones and resets instrument/sample defaults", () => {
    const s = useStore.getState();
    s.addTarget("cd45");
    s.addTarget("cd3e");
    s.setSetup({ blocked: [175], extraMetals: [111] });
    s.setSetup({ modality: "imaging" });
    const st = useStore.getState();
    expect(st.setup.instrumentId).toBe("hyperion_xti");
    expect(st.setup.sampleType).toBe("ffpe");
    // Blocked channels and opted-in metals belong to the previous instrument's strip: they do not carry across.
    expect(st.setup.blocked).toEqual([]);
    expect(st.setup.extraMetals).toBeUndefined();
    for (const r of st.rows) {
      if (r.clone) expect(idx.cloneOptions(r.targetId!, st.setup).some((o) => o.clone === r.clone)).toBe(true);
    }
  });

  it("pinning two rows to one channel releases the first: one row per channel", () => {
    const s = useStore.getState();
    s.addTarget("cd45");
    s.addTarget("cd3e");
    s.lockRow("cd45", 141);
    s.lockRow("cd3e", 141);
    const locked = useStore.getState().rows.map((r) => [r.id, r.locked]);
    expect(locked).toEqual([["cd45", null], ["cd3e", 141]]);
  });

  it("the engine runs on every change; metals stay hidden (balanced=false) until Balance is opened", async () => {
    const s = useStore.getState();
    s.addModule(modules("suspension").find((m) => m.id === "human-pbmc-lineage")!);
    expect(useStore.getState().balanced).toBe(false);
    await until(() => useStore.getState().result != null); // debounce + lazy engine import on the main thread
    const r1 = useStore.getState().result!;
    expect(r1).not.toBeNull();
    expect(useStore.getState().balanced).toBe(false);
    expect(r1.unassigned).toEqual([]);
    expect(Object.keys(r1.assignment)).toHaveLength(useStore.getState().rows.length);
    s.setStep("balance");
    expect(useStore.getState().balanced).toBe(true);
    s.removeRow(useStore.getState().rows[0].id);
    await until(() => !useStore.getState().balancing && useStore.getState().result?.rows.length === useStore.getState().rows.length);
    expect(Object.keys(useStore.getState().result!.assignment)).toHaveLength(useStore.getState().rows.length);
  });

  it("applyFix pins the move when it helps and undoes it (with a notice) when the panel gets worse; lockRow is honoured", async () => {
    const s = useStore.getState();
    s.addModule(modules("suspension").find((m) => m.id === "human-pbmc-lineage")!);
    await s.balanceNow();
    const r1 = useStore.getState().result!;
    expect(useStore.getState().balanced).toBe(true);

    // An arbitrary swap of two rows the optimiser placed deliberately: expected to be worse, hence reverted.
    const row = useStore.getState().rows[0];
    const other = row.id === "cd45" ? "cd3e" : "cd45";
    await s.applyFix({ rowId: row.id, to: r1.assignment[other], toChannel: String(r1.assignment[other]), swapWith: other, delta: 0, message: "swap for the test" });
    const st = useStore.getState();
    if (st.notice) {
      expect(st.notice).toMatch(/undone/);
      expect(st.rows.every((r) => r.locked == null)).toBe(true);
      expect(st.result!.score).toBeLessThanOrEqual(r1.score + 1e-6);
    } else {
      expect(st.rows.find((r) => r.id === row.id)!.locked).toBe(r1.assignment[other]);
      expect(st.result!.assignment[row.id]).toBe(r1.assignment[other]);
    }

    // A fix the engine itself proposes must never be undone: by construction it lowers the score.
    const proposed = useStore.getState().result!.warnings.find((w) => w.fix)?.fix;
    if (proposed) {
      await s.applyFix(proposed);
      expect(useStore.getState().notice).toBeNull();
      expect(useStore.getState().rows.find((r) => r.id === proposed.rowId)!.locked).toBe(proposed.to);
    }

    // A user lock is honoured and released.
    const target = r1.assignment[other];
    s.lockRow(row.id, target);
    await new Promise((r) => setTimeout(r, 400));
    expect(useStore.getState().result!.assignment[row.id]).toBe(target);
    useStore.getState().rows.forEach((r) => r.locked != null && s.lockRow(r.id, null));
    await new Promise((r) => setTimeout(r, 400));
    expect(useStore.getState().rows.every((r) => r.locked == null)).toBe(true);
  });

  it("addModule follows markerPlan: DC on IMC skips CD123 / CD56−, NK on IMC adds CD56 as custom", () => {
    const s = useStore.getState();
    s.setSetup({ modality: "imaging" });
    s.addModule(idx.modulesById.get("ct-human-dc")!);
    expect(useStore.getState().rows.map((r) => r.id).sort()).toEqual(["cd11c", "cd14", "cd19", "cd3e", "hladr"]);
    s.addModule(idx.modulesById.get("ct-human-nk")!);
    const cd56 = useStore.getState().rows.find((r) => r.id === "cd56ncam")!;
    expect(cd56).toMatchObject({ custom: true, clone: null, moduleIds: ["ct-human-nk"] });
  });

  it("level pill override and custom rows survive in the row model", () => {
    const s = useStore.getState();
    s.addCustom("TOX");
    const cd8 = idx.search("CD8a", useStore.getState().setup, 1)[0].id;
    s.addTarget(cd8);
    s.setLevel(cd8, "low");
    const rows = useStore.getState().rows;
    expect(rows.find((r) => r.id === "custom:TOX")).toMatchObject({ targetId: null, custom: true, clone: null });
    expect(rows.find((r) => r.id === cd8)!.level).toBe("low");
    s.setClone(cd8, null);
    expect(useStore.getState().rows.find((r) => r.id === cd8)).toMatchObject({ clone: null, custom: true });
  });
});

describe("store: guided conflicts", () => {
  it("previewFix reports the diff without touching state; commitPreview applies it", async () => {
    const s = useStore.getState();
    s.addModule(modules("suspension").find((m) => m.id === "human-pbmc-lineage")!);
    await s.balanceNow();
    const r1 = useStore.getState().result!;
    const row = useStore.getState().rows[0];
    const other = row.id === "cd45" ? "cd3e" : "cd45";
    const p = await s.previewFix({ rowId: row.id, to: r1.assignment[other], toChannel: "", swapWith: other, delta: 0, message: "swap" });
    expect(useStore.getState().result).toBe(r1); // untouched
    expect(p.moves.map((m) => m.rowId)).toContain(row.id);
    expect(p.moves[0].rowId).toBe(row.id);
    s.commitPreview(p);
    expect(useStore.getState().result).toBe(p.result);
    expect(useStore.getState().rows.find((r) => r.id === row.id)!.locked).toBe(r1.assignment[other]);
  });

  it("cloneAlternatives re-balances with every other clone and never returns the current one", async () => {
    const s = useStore.getState();
    s.addModule(modules("suspension").find((m) => m.id === "human-pbmc-lineage")!);
    await s.balanceNow();
    const multi = useStore.getState().rows.find((r) => r.targetId && idx.cloneOptions(r.targetId, useStore.getState().setup).length > 1);
    if (!multi) return;
    const trials = await s.cloneAlternatives(multi.id);
    expect(trials.length).toBe(idx.cloneOptions(multi.targetId!, useStore.getState().setup).length - 1);
    expect(trials.every((t) => t.clone !== multi.clone && t.result.rows.length === useStore.getState().rows.length)).toBe(true);
  });

  it("acceptWarning / unacceptWarning round-trip on the row", () => {
    const s = useStore.getState();
    s.addTarget("cd45");
    expect(s.acceptWarning("cd45", "   ")).toBe(false); // no reason, no sign-off: the note travels to the Order page
    expect(useStore.getState().rows[0].accepted).toBeUndefined();
    expect(s.acceptWarning("cd45", "  fine  ")).toBe(true);
    expect(useStore.getState().rows[0].accepted).toBe("fine");
    s.unacceptWarning("cd45");
    expect(useStore.getState().rows[0].accepted).toBeNull();
  });
});

describe("kits and the New panel button", () => {
  it("a kit arrives on its own metals: every marker pinned to the kit mass, kit-only vials included", async () => {
    const s = useStore.getState();
    s.clearPanel();
    s.setSetup({ modality: "suspension" });
    const mdipa = useStore.getState().idx!.modulesById.get("direct-immune-profiling-assay-mdipa")!;
    s.addModule(mdipa);
    const rows = useStore.getState().rows;
    expect(rows).toHaveLength(mdipa.markers.length);
    for (const k of mdipa.markers) {
      const r = rows.find((x) => x.targetId === k.target_id)!;
      expect(r.locked).toBe(k.mass);
      expect(r.clone).toBe(k.clone);
      expect(r.clonePinned).toBe(true);
    }
    await useStore.getState().balanceNow();
    const res = useStore.getState().result!;
    expect(res.unassigned).toEqual([]); // CD66b-172Yb, CD57-155Gd and friends exist only in the kit, and still get placed
    for (const k of mdipa.markers) expect(res.assignment[k.target_id!]).toBe(k.mass);
  });

  it("clearPanel empties the panel and returns to Setup (the share hash is dropped in the browser; see e2e)", () => {
    const s = useStore.getState();
    s.addModule(modules("suspension").find((m) => m.id === "human-pbmc-lineage")!);
    s.setStep("build");
    s.clearPanel();
    expect(useStore.getState().rows).toEqual([]);
    expect(useStore.getState().step).toBe("setup");
  });
});
