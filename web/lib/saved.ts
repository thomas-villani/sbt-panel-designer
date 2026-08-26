/** Saved panels in localStorage: the stop-gap before accounts + a server (ROADMAP §3, "Saved panels"). */
import type { Index } from "./data";
import { decodeState, encodeState, type UrlState } from "./url";

export interface SavedPanel { id: string; name: string; savedAt: string; state: string; nRows: number; summary: string }

const KEY = "pd3.savedPanels.v1";
const DRAFT = "pd3.draft.v1";

function storage(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

export function listSaved(): SavedPanel[] {
  const s = storage();
  if (!s) return [];
  try {
    const arr = JSON.parse(s.getItem(KEY) ?? "[]") as SavedPanel[];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function writeAll(list: SavedPanel[]): void {
  const s = storage();
  if (!s) return;
  try { s.setItem(KEY, JSON.stringify(list)); } catch { /* quota / private mode: saving is best-effort */ }
}

export function summarise(st: UrlState): string {
  return `${st.setup.modality === "imaging" ? "IMC" : "CyTOF"} · ${st.setup.species} · ${st.setup.sampleType} · ${st.rows.length} marker${st.rows.length === 1 ? "" : "s"}`;
}

/** Save under `name`; a panel with the same name is replaced (same id kept). Returns the saved record. */
export function savePanel(name: string, st: UrlState, now = new Date()): SavedPanel {
  const list = listSaved();
  const existing = list.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  const rec: SavedPanel = {
    id: existing?.id ?? `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim(), savedAt: now.toISOString(), state: encodeState(st), nRows: st.rows.length, summary: summarise(st),
  };
  writeAll([rec, ...list.filter((p) => p.id !== rec.id)]);
  return rec;
}

export function deleteSaved(id: string): void {
  writeAll(listSaved().filter((p) => p.id !== id));
}

export function loadSaved(id: string, idx?: Index): UrlState | null {
  const rec = listSaved().find((p) => p.id === id);
  return rec ? decodeState(rec.state, idx) : null;
}

/** The in-progress panel, written on every change so a closed tab is not a lost panel. */
export function writeDraft(st: UrlState, idx?: Index): void {
  const s = storage();
  if (!s) return;
  try {
    if (st.rows.length) s.setItem(DRAFT, encodeState(st, idx)); else s.removeItem(DRAFT);
  } catch { /* best-effort */ }
}

export function readDraft(idx?: Index): UrlState | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(DRAFT);
    return raw ? decodeState(raw, idx) : null;
  } catch { return null; }
}

export function clearDraft(): void {
  try { storage()?.removeItem(DRAFT); } catch { /* ignore */ }
}
