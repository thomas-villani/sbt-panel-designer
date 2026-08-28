"use client";
/** Panel state. Rows hold biology (target, level, clone, lock); metals only ever live in `result`. */
import { useMemo } from "react";
import { create } from "zustand";
import type { Fix, Result } from "@pd3/engine";
import { Index, channelBudget, defaultInstrument, levelFromSignal, loadPublications, markerPlan, reservedRoles, resolveClones, rowMetals, rowSpec, titratedST } from "./data";
import { balanceInWorker, initEngine } from "./engine-client";
import { panelHealth, type Health } from "./health";
import { LocalPanelStore, clearDraft, readDraft, writeDraft, type PanelStore, type SavedPanel } from "./saved";
import type { AbundanceLevel, Bundles, PanelModule, PanelRow, Publications, Setup } from "./types";
import { landingStep, type Step } from "./steps";
import { decodeStateResult, writeHash, type DecodeDrift, type PanelDoc } from "./url";

export type { Step } from "./steps";

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

/** Where the panel on screen should come from at start-up. The store never reads `window.location` itself. */
export interface Seed {
  /** A share-link hash (with or without `#`). Empty = none. */
  hash?: string;
  /** A ready document (a landing page, a test). Wins over `hash`. */
  doc?: PanelDoc;
  /** Start from these modules on this setup (module landing pages, ROADMAP §6). */
  moduleIds?: string[];
  setup?: Partial<Setup>;
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
  saved: SavedPanel[]; // from the PanelStore, see lib/saved.ts
  saving: boolean;
  restoredDraft: boolean; // the panel on screen came from the last session's draft, not a share link
  pubs: Publications | null; // papers per target, loaded on demand
  pubsState: "idle" | "loading" | "ready" | "error";

  init: (b: Bundles, seed?: Seed) => void;
  savePanel: (name: string) => Promise<void>;
  loadSavedPanel: (id: string) => Promise<void>;
  deleteSavedPanel: (id: string) => Promise<void>;
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
  /** Sign off the spill a row receives. An empty reason is refused: the note travels to the Order page and the share link. */
  acceptWarning: (rowId: string, reason: string) => boolean;
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
let panelStore: PanelStore = new LocalPanelStore();
/** Swap the persistence backend (a server-backed store once accounts exist). */
export function setPanelStore(s: PanelStore): void { panelStore = s; }

/** One sentence about what a decoded document lost, or null when nothing did. */
export function driftNotice(drift: DecodeDrift, idx: Index): string | null {
  const parts: string[] = [];
  if (drift.unknownTargets.length) parts.push(`${drift.unknownTargets.length} marker${drift.unknownTargets.length > 1 ? "s are" : " is"} no longer in the catalogue (${drift.unknownTargets.slice(0, 4).join(", ")}${drift.unknownTargets.length > 4 ? ", …" : ""}) and will be treated as custom`);
  if (drift.resetFields.includes("instrumentId") || drift.resetFields.includes("modality")) parts.push("its instrument is not in this catalogue, so the default was used and pins were released");
  else if (drift.resetFields.length) parts.push(`some setup choices (${drift.resetFields.join(", ")}) were reset`);
  if (!parts.length) return null;
  const when = drift.catalogChanged ? `This panel was made against an older catalogue (now ${idx.bundles.catalog.version}): ` : "";
  return `${when}${parts.join("; ")}.`;
}

export const useStore = create<State>((set, get) => {
  const snapshot = (): PanelDoc => {
    const { setup, rows, nSamples, balanced, idx } = get();
    return { setup, rows, nSamples, balanced, ...(idx ? { catalogVersion: idx.bundles.catalog.version } : {}) };
  };
  const persist = () => {
    const doc = snapshot();
    const idx = get().idx ?? undefined;
    writeHash(doc, idx);
    writeDraft(doc, idx);
  };
  const restore = (doc: PanelDoc, extra: Partial<State> = {}) => {
    set({ setup: doc.setup, rows: doc.rows, nSamples: doc.nSamples, balanced: doc.balanced, result: null, notice: null, step: landingStep(doc), ...extra });
    persist();
    if (doc.rows.length) void run();
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
        extraReserved: setup.blocked, extraMetals: setup.extraMetals,
      }, { seed: 1 });
      if (seq === runSeq) {
        const current = get().rows;
        const resolved = resolveClones(idx, current, result.assignment, setup);
        set({ result, balancing: false, ...(resolved !== current ? { rows: resolved } : {}) });
        if (resolved !== current) persist();
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
      extraReserved: setup.blocked, extraMetals: setup.extraMetals,
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
    // A kit joining an existing row brings its clone and metal along unless the user already pinned their own.
    const merged = {
      ...cur, moduleIds: [...new Set([...cur.moduleIds, ...row.moduleIds])],
      ...(row.clonePinned && !cur.clonePinned ? { clone: row.clone, clonePinned: true, custom: false } : {}),
      ...(row.locked != null && cur.locked == null ? { locked: row.locked } : {}),
    };
    return rows.map((r, j) => (j === i ? merged : r));
  };
  const makeRow = (idx: Index, setup: Setup, targetId: string, o: { moduleId?: string; level?: AbundanceLevel | null; clone?: string | null; mass?: number | null } = {}): PanelRow | null => {
    const t = idx.targetsById.get(targetId);
    if (!t) return null;
    const opts = idx.cloneOptions(targetId, setup);
    // A kit's metal is part of the product: the row arrives pinned to it (the user can still unpin).
    const locked = o.mass != null && idx.instrument(setup.instrumentId).channels.some((c) => c.mass === o.mass && c.usable) ? o.mass : null;
    // A kit names its clone: keep it, even when that clone is only sold inside the kit (no loose catalogue vial).
    const pinned = !!o.clone && (opts.some((x) => x.clone === o.clone) || locked != null);
    const clone = pinned ? o.clone! : opts[0]?.clone ?? null;
    const st = clone ? titratedST(opts.find((x) => x.clone === clone)?.conjugates ?? []) : null;
    const level = o.level ?? levelFromSignal(st?.signal) ?? "medium";
    return { id: targetId, targetId, name: t.name, level, clone, custom: !clone, locked, moduleIds: o.moduleId ? [o.moduleId] : [], ...(pinned ? { clonePinned: true } : {}) };
  };
  const refreshSaved = async () => { try { set({ saved: await panelStore.list() }); } catch { set({ saved: [] }); } };

  return {
    idx: null, loadError: null, setup: DEFAULT_SETUP, rows: [], step: "setup", balanced: false, balancing: false, result: null,
    engineError: null, notice: null, nSamples: 20, saved: [], saving: false, restoredDraft: false, pubs: null, pubsState: "idle",

    init: (b, seed = {}) => {
      const idx = new Index(b);
      initEngine(b.instruments);
      set({ idx, notice: null, engineError: null });
      void refreshSaved();
      // 1. An explicit document or a share link.
      let doc: PanelDoc | null = seed.doc ?? null;
      let notice: string | null = null;
      if (!doc && seed.hash) {
        const r = decodeStateResult(seed.hash, idx);
        if (r.ok) { doc = r.doc; notice = driftNotice(r.drift, idx); }
        else if (r.reason !== "empty") notice = r.reason === "unsupported_version" ? "This share link was made by a newer version of the designer and could not be read." : "This share link could not be read; it may have been cut short when it was copied.";
      }
      if (doc) { restore(doc, { notice }); return; }
      // 2. A landing page's starting point.
      if (seed.moduleIds?.length || seed.setup) {
        const setup = { ...DEFAULT_SETUP, ...seed.setup };
        set({ setup: seed.setup?.modality && !seed.setup.instrumentId ? { ...setup, instrumentId: defaultInstrument(idx, setup.modality) } : setup, rows: [], balanced: false, step: seed.moduleIds?.length ? "build" : "setup", notice });
        for (const id of seed.moduleIds ?? []) { const m = idx.module(id); if (m) get().addModule(m); }
        return;
      }
      // 3. Last session's draft.
      const draft = readDraft(idx);
      if (draft && draft.rows.length) restore(draft, { restoredDraft: true, notice });
      else if (notice) set({ notice });
    },
    savePanel: async (name) => {
      if (!name.trim()) return;
      set({ saving: true });
      try {
        await panelStore.save(name, snapshot(), get().idx ?? undefined);
        await refreshSaved();
      } catch (e) {
        set({ notice: `The panel was not saved: ${e instanceof Error ? e.message : String(e)}. Copy the share link instead.` });
      } finally { set({ saving: false }); }
    },
    loadSavedPanel: async (id) => {
      const idx = get().idx ?? undefined;
      const doc = await panelStore.load(id, idx);
      if (doc) restore(doc, { restoredDraft: false });
    },
    deleteSavedPanel: async (id) => { await panelStore.delete(id); await refreshSaved(); },
    dismissRestored: () => set({ restoredDraft: false }),
    ensurePubs: () => {
      if (get().pubsState !== "idle" || typeof window === "undefined") return;
      set({ pubsState: "loading" });
      void loadPublications().then((pubs) => set({ pubs, pubsState: pubs.version ? "ready" : "error" }));
    },
    setStep: (step) => {
      // Opening Balance is the moment metals become visible; the engine has usually already run.
      if (step === "balance" && !get().balanced) { set({ step, balanced: true }); persist(); if (!get().result) void run(); }
      else set({ step });
    },
    setSetup: (patch) => {
      const { idx, setup, rows } = get();
      const next: Setup = { ...setup, ...patch };
      if (patch.modality && patch.modality !== setup.modality) {
        next.instrumentId = idx ? defaultInstrument(idx, patch.modality) : next.instrumentId;
        next.sampleType = patch.modality === "imaging" ? "ffpe" : "pbmc";
        // Blocked channels and opted-in metals are choices about one instrument's strip; they do not carry across.
        next.blocked = [];
        delete next.extraMetals;
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
          const row = makeRow(idx, setup, k.target_id, { moduleId: m.id, level: k.abundance_level, clone: k.clone, mass: m.source === "sbt_kit" ? k.mass : null });
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
    lockRow: (id, mass) => {
      const { idx, setup } = get();
      // One row per channel: pinning here releases whoever else was pinned to the same mass (the engine refuses duplicate locks).
      set({ rows: get().rows.map((r) => {
        if (r.id !== id) return mass != null && r.locked === mass ? { ...r, locked: null } : r;
        // A metal no catalogue vial of this clone covers means the user has (or will make) their own conjugate.
        const custom = mass != null && !!idx && r.targetId != null && !r.custom && !rowMetals(idx, r, setup).includes(mass) ? true : r.custom;
        return { ...r, locked: mass, custom };
      }) });
      touch();
    },
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
    acceptWarning: (rowId, reason) => {
      const why = reason.trim();
      if (!why) return false;
      set({ rows: get().rows.map((r) => (r.id === rowId ? { ...r, accepted: why } : r)) });
      persist();
      return true;
    },
    unacceptWarning: (rowId) => { set({ rows: get().rows.map((r) => (r.id === rowId ? { ...r, accepted: null } : r)) }); persist(); },
    balanceNow: async () => {
      set({ balanced: true });
      persist();
      await run();
    },
    dismissNotice: () => set({ notice: null }),
    setNSamples: (n) => { set({ nSamples: Math.max(1, Math.round(n) || 1) }); persist(); },
    clearPanel: () => {
      if (timer) clearTimeout(timer);
      runSeq++;
      set({ rows: [], result: null, balanced: false, restoredDraft: false, notice: null, engineError: null, step: "setup" });
      clearDraft();
      // Drop the share hash too: a leftover "#..." from the previous panel read as a file name to SBT's testers.
      if (typeof window !== "undefined" && window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    },
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
