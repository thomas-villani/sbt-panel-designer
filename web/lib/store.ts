"use client";
/** Panel state. Rows hold biology (target, level, clone, lock); metals only ever live in `result`. */
import { create } from "zustand";
import type { Fix, Result } from "@pd3/engine";
import { Index, channelBudget, defaultInstrument, levelFromSignal, loadPublications, markerPlan, reservedRoles, rowSpec, titratedST } from "./data";
import { balanceInWorker, initEngine } from "./engine-client";
import { clearDraft, deleteSaved, listSaved, loadSaved, readDraft, savePanel, writeDraft, type SavedPanel } from "./saved";
import type { AbundanceLevel, Bundles, PanelModule, PanelRow, Publications, Setup } from "./types";
import { decodeState, writeHash, type UrlState } from "./url";

export type Step = "setup" | "build" | "balance" | "order";

interface State {
  idx: Index | null;
  loadError: string | null;
  setup: Setup;
  rows: PanelRow[];
  step: Step;
  balanced: boolean; // the user has pressed Balance at least once: metals may be shown
  balancing: boolean;
  result: Result | null;
  engineError: string | null;
  nSamples: number;
  saved: SavedPanel[]; // localStorage, see lib/saved.ts
  restoredDraft: boolean; // the panel on screen came from the last session's draft, not a share link
  pubs: Publications | null; // papers per target, loaded on demand

  init: (b: Bundles) => void;
  savePanel: (name: string) => void;
  loadSavedPanel: (id: string) => void;
  deleteSavedPanel: (id: string) => void;
  dismissRestored: () => void;
  ensurePubs: () => void;
  setStep: (s: Step) => void;
  setSetup: (patch: Partial<Setup>) => void;
  addModule: (m: PanelModule) => void;
  removeModule: (id: string) => void;
  addTarget: (targetId: string, opts?: { moduleId?: string; level?: AbundanceLevel | null; clone?: string | null }) => void;
  addCustom: (name: string) => void;
  removeRow: (id: string) => void;
  setLevel: (id: string, level: AbundanceLevel) => void;
  setClone: (id: string, clone: string | null) => void;
  lockRow: (id: string, mass: number | null) => void;
  applyFix: (fix: Fix) => void;
  balanceNow: () => Promise<void>;
  setNSamples: (n: number) => void;
  clearPanel: () => void;
}

const DEFAULT_SETUP: Setup = {
  modality: "suspension", species: "human", sampleType: "pbmc", instrumentId: "cytof_xt", viability: true, barcoding: false,
};

let timer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<State>((set, get) => {
  const snapshot = (): UrlState => {
    const { setup, rows, nSamples, balanced } = get();
    return { setup, rows, nSamples, balanced };
  };
  const persist = () => {
    const st = snapshot();
    const idx = get().idx ?? undefined;
    writeHash(st, idx);
    writeDraft(st, idx);
  };
  const restore = (st: UrlState, extra: Partial<State> = {}) => {
    set({ setup: st.setup, rows: st.rows, nSamples: st.nSamples, balanced: st.balanced, result: null, step: st.rows.length ? (st.balanced ? "balance" : "build") : "setup", ...extra });
    persist();
    if (st.balanced) void get().balanceNow();
  };
  const touch = () => {
    persist();
    if (!get().balanced) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void get().balanceNow(), 120);
  };
  const upsertRow = (rows: PanelRow[], row: PanelRow): PanelRow[] => {
    const i = rows.findIndex((r) => r.id === row.id);
    if (i < 0) return [...rows, row];
    const cur = rows[i];
    const merged = { ...cur, moduleIds: [...new Set([...cur.moduleIds, ...row.moduleIds])] };
    return rows.map((r, j) => (j === i ? merged : r));
  };
  const makeRow = (idx: Index, setup: Setup, targetId: string, o: { moduleId?: string; level?: AbundanceLevel | null; clone?: string | null } = {}): PanelRow | null => {
    const t = idx.targetsById.get(targetId);
    if (!t) return null;
    const opts = idx.cloneOptions(targetId, setup);
    const clone = o.clone && opts.some((x) => x.clone === o.clone) ? o.clone : opts[0]?.clone ?? null;
    const st = clone ? titratedST(opts.find((x) => x.clone === clone)!.conjugates) : null;
    const level = o.level ?? levelFromSignal(st?.signal) ?? "medium";
    return { id: targetId, targetId, name: t.name, level, clone, custom: !clone, locked: null, moduleIds: o.moduleId ? [o.moduleId] : [] };
  };

  return {
    idx: null, loadError: null, setup: DEFAULT_SETUP, rows: [], step: "setup", balanced: false, balancing: false, result: null,
    engineError: null, nSamples: 20, saved: [], restoredDraft: false, pubs: null,

    init: (b) => {
      const idx = new Index(b);
      initEngine(b.instruments);
      set({ idx, saved: listSaved() });
      get().ensurePubs();
      const fromUrl = typeof window !== "undefined" ? decodeState(window.location.hash, idx) : null;
      const draft = fromUrl ? null : readDraft(idx);
      if (fromUrl) restore(fromUrl);
      else if (draft && draft.rows.length) restore(draft, { restoredDraft: true });
    },
    savePanel: (name) => {
      if (!name.trim()) return;
      savePanel(name, snapshot());
      set({ saved: listSaved() });
    },
    loadSavedPanel: (id) => {
      const st = loadSaved(id, get().idx ?? undefined);
      if (st) restore(st, { restoredDraft: false });
    },
    deleteSavedPanel: (id) => { deleteSaved(id); set({ saved: listSaved() }); },
    dismissRestored: () => set({ restoredDraft: false }),
    ensurePubs: () => {
      if (get().pubs || typeof window === "undefined") return;
      set({ pubs: { version: null, source: null, stats: {}, targets: {} } }); // placeholder while loading
      void loadPublications().then((pubs) => set({ pubs }));
    },
    setStep: (step) => set({ step }),
    setSetup: (patch) => {
      const { idx, setup, rows } = get();
      const next = { ...setup, ...patch };
      if (patch.modality && patch.modality !== setup.modality) {
        next.instrumentId = idx ? defaultInstrument(idx, patch.modality) : next.instrumentId;
        next.sampleType = patch.modality === "imaging" ? "ffpe" : "pbmc";
      }
      // Re-resolve clones under the new setup; keep the user's level choices.
      const rerows = idx ? rows.map((r) => {
        if (!r.targetId) return r;
        const opts = idx.cloneOptions(r.targetId, next);
        const clone = opts.some((o) => o.clone === r.clone) ? r.clone : opts[0]?.clone ?? null;
        return { ...r, clone, custom: !clone, locked: clone === r.clone ? r.locked : null };
      }) : rows;
      set({ setup: next, rows: rerows });
      touch();
    },
    addModule: (m) => {
      const { idx, setup } = get();
      if (!idx) return;
      let rows = get().rows;
      for (const k of m.markers) {
        const plan = markerPlan(k, setup);
        if (plan === "skip") continue;
        if (k.target_id && k.in_catalogue) { // makeRow yields a custom row when no conjugate is sold for this modality
          const row = makeRow(idx, setup, k.target_id, { moduleId: m.id, level: k.abundance_level, clone: k.clone });
          if (row) rows = upsertRow(rows, row);
        } else {
          const id = `custom:${k.target_name}`;
          rows = upsertRow(rows, { id, targetId: null, name: k.target_name, level: k.abundance_level ?? "medium", clone: null, custom: true, locked: null, moduleIds: [m.id] });
        }
      }
      set({ rows });
      touch();
    },
    removeModule: (id) => {
      set({
        rows: get().rows.filter((r) => !wasOnlyFrom(r, id)).map((r) => ({ ...r, moduleIds: r.moduleIds.filter((m) => m !== id) })),
      });
      touch();
    },
    addTarget: (targetId, o) => {
      const { idx, setup } = get();
      if (!idx) return;
      const row = makeRow(idx, setup, targetId, o);
      if (row) set({ rows: upsertRow(get().rows, row) });
      touch();
    },
    addCustom: (name) => {
      const id = `custom:${name}`;
      set({ rows: upsertRow(get().rows, { id, targetId: null, name, level: "medium", clone: null, custom: true, locked: null, moduleIds: [] }) });
      touch();
    },
    removeRow: (id) => { set({ rows: get().rows.filter((r) => r.id !== id) }); touch(); },
    setLevel: (id, level) => { set({ rows: get().rows.map((r) => (r.id === id ? { ...r, level } : r)) }); touch(); },
    setClone: (id, clone) => { set({ rows: get().rows.map((r) => (r.id === id ? { ...r, clone, custom: !clone, locked: null } : r)) }); touch(); },
    lockRow: (id, mass) => { set({ rows: get().rows.map((r) => (r.id === id ? { ...r, locked: mass } : r)) }); touch(); },
    applyFix: (fix) => {
      const { rows, result } = get();
      const prev = result?.assignment[fix.rowId] ?? null;
      set({
        rows: rows.map((r) => {
          if (r.id === fix.rowId) return { ...r, locked: fix.to };
          if (fix.swapWith && r.id === fix.swapWith) return { ...r, locked: prev };
          return r;
        }),
      });
      touch();
    },
    balanceNow: async () => {
      const { idx, setup, rows } = get();
      if (!idx) return;
      set({ balanced: true, balancing: true, engineError: null });
      persist();
      try {
        const result = await balanceInWorker({
          instrumentId: setup.instrumentId, rows: rows.map((r) => rowSpec(idx, r, setup)), reservedRoles: reservedRoles(setup),
        }, { seed: 1 });
        set({ result, balancing: false });
      } catch (e) {
        set({ engineError: e instanceof Error ? e.message : String(e), balancing: false });
      }
    },
    setNSamples: (n) => { set({ nSamples: Math.max(1, Math.round(n) || 1) }); persist(); },
    clearPanel: () => { set({ rows: [], result: null, balanced: false, restoredDraft: false }); clearDraft(); persist(); },
  };
});

function wasOnlyFrom(r: PanelRow, moduleId: string): boolean {
  return r.moduleIds.length === 1 && r.moduleIds[0] === moduleId;
}

export function useBudget(): number {
  const idx = useStore((s) => s.idx);
  const setup = useStore((s) => s.setup);
  return idx ? channelBudget(idx, setup) : 0;
}
