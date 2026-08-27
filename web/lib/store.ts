"use client";
/** Panel state. Rows hold biology (target, level, clone, lock); metals only ever live in `result`. */
import { useMemo } from "react";
import { create } from "zustand";
import type { Fix, Result } from "@pd3/engine";
import { Index, channelBudget, defaultInstrument, levelFromSignal, loadPublications, markerPlan, reservedRoles, resolveClones, rowSpec, titratedST } from "./data";
import { balanceInWorker, initEngine } from "./engine-client";
import { panelHealth, type Health } from "./health";
import { clearDraft, deleteSaved, listSaved, loadSaved, readDraft, savePanel, writeDraft, type SavedPanel } from "./saved";
import type { AbundanceLevel, Bundles, PanelModule, PanelRow, Publications, Setup } from "./types";
import { decodeState, writeHash, type UrlState } from "./url";

export type Step = "setup" | "build" | "balance" | "order";

export interface FixPreview {
  fix: Fix;
  rows: PanelRow[];
  result: Result;
  before: number;
  after: number;
  /** Every marker whose channel changes, the fixed one first. */
  moves: { rowId: string; label: string; from: string; to: string }[];
}

export interface CloneTrial {
  rowId: string;
  clone: string;
  nMetals: number;
  result: Result;
  score: number;
  channel: string | null;
  /** Spill received by the row, as a fraction of its tolerance, with this clone. */
  receivedOverT: number;
}

interface State {
  idx: Index | null;
  loadError: string | null;
  setup: Setup;
  rows: PanelRow[];
  step: Step;
  balanced: boolean; // the user has opened Balance at least once: metals may be shown. The engine itself runs on every change.
  balancing: boolean;
  result: Result | null;
  engineError: string | null;
  notice: string | null; // one-line feedback on the last action (e.g. a fix that was tried and reverted)
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
  addCustom: (name: string, mass?: number | null) => void;
  toggleBlocked: (mass: number) => void;
  removeRow: (id: string) => void;
  setLevel: (id: string, level: AbundanceLevel) => void;
  /** Pin a clone (or null = custom conjugation). */
  setClone: (id: string, clone: string | null) => void;
  /** Put every catalogue clone back on the table for this row. */
  freeClone: (id: string) => void;
  lockRow: (id: string, mass: number | null) => void;
  applyFix: (fix: Fix) => Promise<void>;
  /** What a fix would do, without doing it: the panel is re-balanced around the pinned move and the diff returned. */
  previewFix: (fix: Fix) => Promise<FixPreview>;
  commitPreview: (p: FixPreview) => void;
  /** Re-balance with each other catalogue clone for this row, so the card can say which one makes a conflict go away. */
  cloneAlternatives: (rowId: string) => Promise<CloneTrial[]>;
  acceptWarning: (rowId: string, reason: string) => void;
  unacceptWarning: (rowId: string) => void;
  balanceNow: () => Promise<void>;
  dismissNotice: () => void;
  setNSamples: (n: number) => void;
  clearPanel: () => void;
}

const DEFAULT_SETUP: Setup = {
  modality: "suspension", species: "human", sampleType: "pbmc", instrumentId: "cytof_xt", viability: true, barcoding: false,
  segmentation: true, blocked: [],
};

let timer: ReturnType<typeof setTimeout> | null = null;
let runSeq = 0; // results from a superseded run are dropped

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
    set({ setup: st.setup, rows: st.rows, nSamples: st.nSamples, balanced: st.balanced, result: null, notice: null, step: st.rows.length ? (st.balanced ? "balance" : "build") : "setup", ...extra });
    persist();
    if (st.rows.length) void run();
  };
  /** Balance now. Metals stay hidden until the user opens Balance, but the health line is live from the first marker. */
  const run = async () => {
    const { idx, setup, rows } = get();
    if (!idx) return;
    if (timer) { clearTimeout(timer); timer = null; }
    if (!rows.length) { set({ result: null, balancing: false }); return; }
    const seq = ++runSeq;
    set({ balancing: true, engineError: null });
    try {
      const result = await balanceInWorker({
        instrumentId: setup.instrumentId, rows: rows.map((r) => rowSpec(idx, r, setup)), reservedRoles: reservedRoles(setup),
        extraReserved: setup.blocked,
      }, { seed: 1 });
      if (seq === runSeq) {
        const resolved = resolveClones(idx, get().rows, result.assignment, setup);
        set({ result, balancing: false, ...(resolved !== get().rows ? { rows: resolved } : {}) });
        if (resolved !== rows) persist();
      }
    } catch (e) {
      if (seq === runSeq) set({ engineError: e instanceof Error ? e.message : String(e), balancing: false });
    }
  };
  /** Balance a hypothetical panel without touching state. */
  const simulate = (rows: PanelRow[]): Promise<Result> => {
    const { idx, setup } = get();
    return balanceInWorker({
      instrumentId: setup.instrumentId, rows: rows.map((r) => rowSpec(idx!, r, setup)), reservedRoles: reservedRoles(setup),
      extraReserved: setup.blocked,
    }, { seed: 1 });
  };
  const withFix = (rows: PanelRow[], result: Result | null, fix: Fix): PanelRow[] => {
    const prev = result?.assignment[fix.rowId] ?? null;
    return rows.map((r) => {
      if (r.id === fix.rowId) return { ...r, locked: fix.to };
      if (fix.swapWith && r.id === fix.swapWith) return { ...r, locked: prev };
      return r;
    });
  };
  const touch = () => {
    persist();
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), 120);
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
    const pinned = !!o.clone && opts.some((x) => x.clone === o.clone); // a kit names its clone: keep it
    const clone = pinned ? o.clone! : opts[0]?.clone ?? null;
    const st = clone ? titratedST(opts.find((x) => x.clone === clone)!.conjugates) : null;
    const level = o.level ?? levelFromSignal(st?.signal) ?? "medium";
    return { id: targetId, targetId, name: t.name, level, clone, custom: !clone, locked: null, moduleIds: o.moduleId ? [o.moduleId] : [], ...(pinned ? { clonePinned: true } : {}) };
  };

  return {
    idx: null, loadError: null, setup: DEFAULT_SETUP, rows: [], step: "setup", balanced: false, balancing: false, result: null,
    engineError: null, notice: null, nSamples: 20, saved: [], restoredDraft: false, pubs: null,

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
    setStep: (step) => {
      // Opening Balance is the moment metals become visible; the engine has usually already run.
      if (step === "balance" && !get().balanced) { set({ step, balanced: true }); persist(); if (!get().result) void run(); }
      else set({ step });
    },
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
        const keep = opts.some((o) => o.clone === r.clone);
        const clone = keep ? r.clone : opts[0]?.clone ?? null;
        return { ...r, clone, custom: !clone, locked: keep ? r.locked : null, clonePinned: keep && r.clonePinned };
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
    addCustom: (name, mass = null) => {
      const id = `custom:${name}`;
      set({ rows: upsertRow(get().rows, { id, targetId: null, name, level: "medium", clone: null, custom: true, locked: mass ?? null, moduleIds: [] }) });
      touch();
    },
    /** Keep a channel empty (an RPT nuclide, a reagent we do not model). Any row locked there is released. */
    toggleBlocked: (mass) => {
      const { setup, rows } = get();
      const blocked = setup.blocked.includes(mass) ? setup.blocked.filter((m) => m !== mass) : [...setup.blocked, mass].sort((a, b) => a - b);
      set({ setup: { ...setup, blocked }, rows: rows.map((r) => (r.locked === mass && blocked.includes(mass) ? { ...r, locked: null } : r)) });
      touch();
    },
    removeRow: (id) => { set({ rows: get().rows.filter((r) => r.id !== id) }); touch(); },
    setLevel: (id, level) => { set({ rows: get().rows.map((r) => (r.id === id ? { ...r, level } : r)) }); touch(); },
    setClone: (id, clone) => { set({ rows: get().rows.map((r) => (r.id === id ? { ...r, clone, custom: !clone, locked: null, clonePinned: true } : r)) }); touch(); },
    freeClone: (id) => { set({ rows: get().rows.map((r) => (r.id === id ? { ...r, clonePinned: false, custom: false, locked: null } : r)) }); touch(); },
    lockRow: (id, mass) => { set({ rows: get().rows.map((r) => (r.id === id ? { ...r, locked: mass } : r)) }); touch(); },
    /**
     * Try the engine's suggested move. The move pins the marker(s) so the next balance honours it; if the whole panel
     * ends up worse the pins are dropped again, so a chain of "Apply" clicks cannot dig the user into a hole.
     */
    applyFix: async (fix) => {
      const { rows, result } = get();
      const before = result?.score ?? Infinity;
      set({ notice: null, rows: withFix(rows, result, fix) });
      persist();
      await run();
      const after = get().result?.score ?? Infinity;
      if (after > before + 1e-6) {
        set({ rows, notice: `Tried "${fix.message}": the panel as a whole got worse (score ${before.toFixed(2)} → ${after.toFixed(2)}), so it was undone.` });
        persist();
        await run();
      }
    },
    previewFix: async (fix) => {
      const { rows, result } = get();
      const next = withFix(rows, result, fix);
      const sim = await simulate(next);
      const label = new Map(sim.rows.map((r) => [r.rowId, r]));
      const moves = rows
        .filter((r) => (result?.assignment[r.id] ?? null) !== (sim.assignment[r.id] ?? null))
        .map((r) => ({ rowId: r.id, label: r.name, from: result?.rows.find((x) => x.rowId === r.id)?.channel ?? "—", to: label.get(r.id)?.channel ?? "—" }))
        .sort((a, b) => Number(b.rowId === fix.rowId) - Number(a.rowId === fix.rowId));
      return { fix, rows: next, result: sim, before: result?.score ?? Infinity, after: sim.score, moves };
    },
    commitPreview: (p) => {
      if (timer) { clearTimeout(timer); timer = null; }
      runSeq++; // a run already in flight must not overwrite the previewed result
      const { idx, setup } = get();
      set({ rows: resolveClones(idx!, p.rows, p.result.assignment, setup), result: p.result, notice: null, balancing: false });
      persist();
    },
    cloneAlternatives: async (rowId) => {
      const { idx, setup, rows } = get();
      const row = rows.find((r) => r.id === rowId);
      if (!idx || !row?.targetId) return [];
      const opts = idx.cloneOptions(row.targetId, setup).filter((o) => o.clone !== row.clone);
      const out: CloneTrial[] = [];
      for (const o of opts) {
        const next = rows.map((r) => (r.id === rowId ? { ...r, clone: o.clone, custom: false, locked: null, clonePinned: true } : r));
        const result = await simulate(next);
        const rr = result.rows.find((r) => r.rowId === rowId);
        out.push({ rowId, clone: o.clone, nMetals: o.metals.length, result, score: result.score, channel: rr?.channel ?? null, receivedOverT: rr?.receivedOverT ?? Infinity });
      }
      return out.sort((a, b) => a.receivedOverT - b.receivedOverT || a.score - b.score);
    },
    acceptWarning: (rowId, reason) => { set({ rows: get().rows.map((r) => (r.id === rowId ? { ...r, accepted: reason.trim() || "accepted" } : r)) }); persist(); },
    unacceptWarning: (rowId) => { set({ rows: get().rows.map((r) => (r.id === rowId ? { ...r, accepted: null } : r)) }); persist(); },
    balanceNow: async () => {
      set({ balanced: true });
      persist();
      await run();
    },
    dismissNotice: () => set({ notice: null }),
    setNSamples: (n) => { set({ nSamples: Math.max(1, Math.round(n) || 1) }); persist(); },
    clearPanel: () => { if (timer) clearTimeout(timer); runSeq++; set({ rows: [], result: null, balanced: false, restoredDraft: false, notice: null }); clearDraft(); persist(); },
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

/** The panel's health, live. Spillover chatter is muted on small panels until the user has opened Balance. */
export function useHealth(): Health | null {
  const idx = useStore((s) => s.idx);
  const setup = useStore((s) => s.setup);
  const rows = useStore((s) => s.rows);
  const result = useStore((s) => s.result);
  const balanced = useStore((s) => s.balanced);
  return useMemo(() => (idx ? panelHealth(idx, setup, rows, result, { quiet: !balanced && rows.length < 8 }) : null), [idx, setup, rows, result, balanced]);
}
