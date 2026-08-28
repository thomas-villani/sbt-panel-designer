/**
 * Saved panels. The store talks to a `PanelStore` port; today the only implementation is localStorage (the stop-gap
 * before accounts + a server, ROADMAP §3 "Saved panels"). A server-backed store implements the same four methods and
 * the migration is "copy the local list up on first login", not a rewrite of the store actions.
 */
import type { Index } from "./data";
import { decodeState, encodeState, type PanelDoc } from "./url";

export interface SavedPanel {
  id: string;
  name: string;
  savedAt: string;
  /** The encoded document (same codec as the share link). */
  state: string;
  nRows: number;
  summary: string;
  /** Catalogue version the panel was saved against, when known. */
  catalogVersion?: string;
}

export interface PanelStore {
  list(): Promise<SavedPanel[]>;
  /** Save under `name`; a panel with the same name is replaced (same id kept). Rejects when the write fails. */
  save(name: string, doc: PanelDoc, idx?: Index): Promise<SavedPanel>;
  delete(id: string): Promise<void>;
  load(id: string, idx?: Index): Promise<PanelDoc | null>;
}

export class StorageWriteError extends Error {
  constructor(msg = "could not write to this browser's storage (full, or private mode)") { super(msg); this.name = "StorageWriteError"; }
}

const KEY = "pd3.savedPanels.v1";
const DRAFT = "pd3.draft.v1";

function storage(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

export function summarise(doc: PanelDoc): string {
  return `${doc.setup.modality === "imaging" ? "IMC" : "CyTOF"} · ${doc.setup.species} · ${doc.setup.sampleType} · ${doc.rows.length} marker${doc.rows.length === 1 ? "" : "s"}`;
}

// ---- localStorage implementation (sync primitives, kept exported for tests and for the draft) ----

export function listSaved(): SavedPanel[] {
  const s = storage();
  if (!s) return [];
  try {
    const arr = JSON.parse(s.getItem(KEY) ?? "[]") as SavedPanel[];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

/** Returns false when the browser refused the write (quota, private mode) so the caller can say so. */
function writeAll(list: SavedPanel[]): boolean {
  const s = storage();
  if (!s) return false;
  try { s.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}

/** Save under `name`; a panel with the same name is replaced (same id kept). Throws StorageWriteError when the write fails. */
export function savePanel(name: string, doc: PanelDoc, now = new Date(), idx?: Index): SavedPanel {
  const list = listSaved();
  const existing = list.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  const catalogVersion = doc.catalogVersion ?? idx?.bundles.catalog.version;
  const rec: SavedPanel = {
    id: existing?.id ?? `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim(), savedAt: now.toISOString(), state: encodeState(doc, idx), nRows: doc.rows.length, summary: summarise(doc),
    ...(catalogVersion ? { catalogVersion } : {}),
  };
  if (!writeAll([rec, ...list.filter((p) => p.id !== rec.id)])) throw new StorageWriteError();
  return rec;
}

export function deleteSaved(id: string): void {
  writeAll(listSaved().filter((p) => p.id !== id));
}

export function loadSaved(id: string, idx?: Index): PanelDoc | null {
  const rec = listSaved().find((p) => p.id === id);
  return rec ? decodeState(rec.state, idx) : null;
}

export class LocalPanelStore implements PanelStore {
  async list() { return listSaved(); }
  async save(name: string, doc: PanelDoc, idx?: Index) { return savePanel(name, doc, new Date(), idx); }
  async delete(id: string) { deleteSaved(id); }
  async load(id: string, idx?: Index) { return loadSaved(id, idx); }
}

// ---- the draft: always local, always best-effort ----

/** The in-progress panel, written on every change so a closed tab is not a lost panel. */
export function writeDraft(doc: PanelDoc, idx?: Index): void {
  const s = storage();
  if (!s) return;
  try {
    if (doc.rows.length) s.setItem(DRAFT, encodeState(doc, idx)); else s.removeItem(DRAFT);
  } catch { /* best-effort */ }
}

export function readDraft(idx?: Index): PanelDoc | null {
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
