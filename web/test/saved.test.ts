/** localStorage-backed saved panels and the draft, with a fake window (vitest runs in node). */
import { beforeEach, describe, expect, it } from "vitest";

class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}
const win = { localStorage: new MemStorage(), location: { hash: "", origin: "http://x", pathname: "/" }, history: { replaceState: (_s: unknown, _t: string, url: string) => { win.location.hash = url; } } };
(globalThis as unknown as { window: unknown }).window = win;

const { listSaved, savePanel, deleteSaved, loadSaved, writeDraft, readDraft, clearDraft } = await import("@/lib/saved");
const { useStore } = await import("@/lib/store");
const { index } = await import("./util");

const idx = index();
const CYTOF = { modality: "suspension" as const, species: "human" as const, sampleType: "pbmc" as const, instrumentId: "cytof_xt", viability: true, barcoding: false };
const state = (n: number) => ({
  setup: CYTOF, nSamples: 20, balanced: false,
  rows: Array.from({ length: n }, (_, i) => ({ id: `t${i}`, targetId: `t${i}`, name: `T${i}`, level: "medium" as const, clone: null, custom: true, locked: null, moduleIds: [] })),
});

beforeEach(() => { win.localStorage.clear(); win.location.hash = ""; });

describe("saved panels", () => {
  it("round-trips through localStorage, newest first, same name replaces", () => {
    const a = savePanel("Alpha", state(3), new Date("2026-08-25T10:00:00Z"));
    savePanel("Beta", state(5), new Date("2026-08-25T11:00:00Z"));
    expect(listSaved().map((p) => p.name)).toEqual(["Beta", "Alpha"]);
    expect(listSaved()[1]).toMatchObject({ id: a.id, nRows: 3, summary: "CyTOF · human · pbmc · 3 markers" });
    const a2 = savePanel(" alpha ", state(4), new Date("2026-08-25T12:00:00Z"));
    expect(a2.id).toBe(a.id);
    expect(listSaved().map((p) => [p.name, p.nRows])).toEqual([["alpha", 4], ["Beta", 5]]);
    expect(loadSaved(a.id)!.rows).toHaveLength(4);
    deleteSaved(a.id);
    expect(listSaved()).toHaveLength(1);
    expect(loadSaved(a.id)).toBeNull();
  });

  it("draft is written for non-empty panels and cleared otherwise; garbage is ignored", () => {
    writeDraft(state(2));
    expect(readDraft()!.rows).toHaveLength(2);
    writeDraft(state(0));
    expect(readDraft()).toBeNull();
    win.localStorage.setItem("pd3.savedPanels.v1", "{not json");
    expect(listSaved()).toEqual([]);
    writeDraft(state(1));
    clearDraft();
    expect(readDraft()).toBeNull();
  });
});

describe("store integration", () => {
  it("init restores the draft when there is no share hash, and flags it", () => {
    writeDraft({ ...state(0), rows: [{ id: "cd45", targetId: "cd45", name: "CD45", level: "very_high", clone: null, custom: true, locked: null, moduleIds: [] }] });
    useStore.setState({ rows: [], step: "setup", restoredDraft: false, balanced: false });
    useStore.getState().init(idx.bundles);
    const s = useStore.getState();
    expect(s.restoredDraft).toBe(true);
    expect(s.rows.map((r) => r.id)).toEqual(["cd45"]);
    expect(s.step).toBe("build");
    expect(win.location.hash).toMatch(/^#/); // the restored panel is a share link again
  });

  it("savePanel / loadSavedPanel / deleteSavedPanel drive the saved list", () => {
    useStore.setState({ rows: [], saved: [], restoredDraft: false });
    useStore.getState().init(idx.bundles);
    const s = useStore.getState();
    s.addTarget("cd45");
    s.addTarget("cd3e");
    s.savePanel("Backbone");
    expect(useStore.getState().saved.map((p) => p.name)).toEqual(["Backbone"]);
    s.clearPanel();
    expect(useStore.getState().rows).toHaveLength(0);
    s.loadSavedPanel(useStore.getState().saved[0].id);
    expect(useStore.getState().rows.map((r) => r.id).sort()).toEqual(["cd3e", "cd45"]);
    s.savePanel("   "); // blank names are ignored
    expect(useStore.getState().saved).toHaveLength(1);
    s.deleteSavedPanel(useStore.getState().saved[0].id);
    expect(useStore.getState().saved).toEqual([]);
  });
});
