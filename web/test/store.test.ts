/** Store behaviour without a browser: the engine client falls back to the main thread when Worker is undefined. */
import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@/lib/store";
import { index } from "./util";

const idx = index();
const modules = (app: "imaging" | "suspension") => idx.modulesFor({ modality: app, species: "human", sampleType: app === "imaging" ? "ffpe" : "pbmc", instrumentId: "", viability: true, barcoding: false });

beforeEach(() => {
  useStore.setState({ rows: [], result: null, balanced: false, step: "setup", setup: { modality: "suspension", species: "human", sampleType: "pbmc", instrumentId: "cytof_xt", viability: true, barcoding: false } });
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
    s.setSetup({ modality: "imaging" });
    const st = useStore.getState();
    expect(st.setup.instrumentId).toBe("hyperion_xti");
    expect(st.setup.sampleType).toBe("ffpe");
    for (const r of st.rows) {
      if (r.clone) expect(idx.cloneOptions(r.targetId!, st.setup).some((o) => o.clone === r.clone)).toBe(true);
    }
  });

  it("balanceNow assigns every row, then applyFix / lockRow re-balance with the lock honoured", async () => {
    const s = useStore.getState();
    s.addModule(modules("suspension").find((m) => m.id === "human-pbmc-lineage")!);
    expect(useStore.getState().result).toBeNull();
    await s.balanceNow();
    const r1 = useStore.getState().result!;
    expect(useStore.getState().balanced).toBe(true);
    expect(r1.unassigned).toEqual([]);
    expect(Object.keys(r1.assignment)).toHaveLength(useStore.getState().rows.length);

    const row = useStore.getState().rows[0];
    const other = row.id === "cd45" ? "cd3e" : "cd45";
    const target = r1.assignment[other];
    s.applyFix({ rowId: row.id, to: target, toChannel: String(target), swapWith: other, delta: 0, message: "" });
    await new Promise((r) => setTimeout(r, 400)); // debounce
    const st = useStore.getState();
    expect(st.rows.find((r) => r.id === row.id)!.locked).toBe(target);
    expect(st.rows.find((r) => r.id === other)!.locked).toBe(r1.assignment[row.id]);
    expect(st.result!.assignment[row.id]).toBe(target);
    expect(st.result!.assignment[other]).toBe(r1.assignment[row.id]);

    s.lockRow(row.id, null);
    s.lockRow(other, null);
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
