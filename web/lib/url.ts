/**
 * Every panel state is a URL: setup + rows live in the hash (SPEC 6.2).
 *
 * v2 (current): `#~` + base64url(deflate-raw(JSON)). The JSON keeps only what the catalogue cannot rebuild — a row is
 * `[id, level, clone?, locked?, moduleIds?]` with trailing defaults dropped; names come back from the target id, and a
 * clone equal to the catalogue default for the setup is written as `1` and re-resolved on decode. ~7× smaller than v1.
 * v1 (legacy, still decoded): base64url JSON with every field spelled out. Old share links keep working.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import type { Index } from "./data";
import type { AbundanceLevel, PanelRow, Setup } from "./types";

export interface UrlState { setup: Setup; rows: PanelRow[]; nSamples: number; balanced: boolean }

const LEVELS: AbundanceLevel[] = ["low", "medium", "high", "very_high"];
const CUSTOM = "custom:";
const V2 = "~";

type SetupTuple = [Setup["modality"], Setup["species"], Setup["sampleType"], string, 0 | 1, 0 | 1];
type CloneV2 = string | 0 | 1; // 0 = no clone (custom conjugation), 1 = the catalogue default for this setup
type RowV2 = [string, number, CloneV2?, (number | 0)?, string[]?];
type V2 = [2, SetupTuple, number, 0 | 1, RowV2[]];
type V1 = {
  v: 1;
  s: SetupTuple;
  n: number;
  b: 0 | 1;
  r: [string, string | null, string, AbundanceLevel, string | null, 0 | 1, number | null, string[]][];
};

function toB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const setupTuple = (s: Setup): SetupTuple => [s.modality, s.species, s.sampleType, s.instrumentId, s.viability ? 1 : 0, s.barcoding ? 1 : 0];
const setupFromTuple = (t: SetupTuple): Setup => ({ modality: t[0], species: t[1], sampleType: t[2], instrumentId: t[3], viability: !!t[4], barcoding: !!t[5] });

const defaultClone = (idx: Index | undefined, targetId: string, setup: Setup): string | null | undefined =>
  idx ? idx.cloneOptions(targetId, setup)[0]?.clone ?? null : undefined;

/** Encode for the hash / localStorage. With `idx`, default clones are elided (the share link gets shorter). */
export function encodeState(st: UrlState, idx?: Index): string {
  const rows: RowV2[] = st.rows.map((r) => {
    const id = r.targetId ?? `${CUSTOM}${r.name}`;
    const clone: CloneV2 = r.clone === null ? 0 : r.targetId && defaultClone(idx, r.targetId, st.setup) === r.clone ? 1 : r.clone;
    const row: RowV2 = [id, Math.max(0, LEVELS.indexOf(r.level)), clone, r.locked ?? 0, r.moduleIds];
    // Drop trailing defaults: no modules, no lock, default clone.
    if (row[4]!.length === 0) { row.pop(); if (row[3] === 0) { row.pop(); if (row[2] === 1) row.pop(); } }
    return row;
  });
  const v2: V2 = [2, setupTuple(st.setup), st.nSamples, st.balanced ? 1 : 0, rows];
  return V2 + toB64url(deflateSync(strToU8(JSON.stringify(v2)), { level: 9 }));
}

/** Decode a hash (with or without `#`) or a stored string. `idx` rebuilds names and default clones for catalogue rows. */
export function decodeState(hash: string, idx?: Index): UrlState | null {
  try {
    const raw = hash.replace(/^#/, "");
    if (!raw) return null;
    if (raw.startsWith(V2)) return decodeV2(JSON.parse(strFromU8(inflateSync(fromB64url(raw.slice(1))))) as V2, idx);
    const c = JSON.parse(strFromU8(fromB64url(raw))) as V1;
    if (c.v !== 1) return null;
    return {
      setup: setupFromTuple(c.s), nSamples: c.n, balanced: !!c.b,
      rows: c.r.map(([id, targetId, name, level, clone, custom, locked, moduleIds]) => ({ id, targetId, name, level, clone, custom: !!custom, locked, moduleIds })),
    };
  } catch {
    return null;
  }
}

function decodeV2(v: V2, idx?: Index): UrlState | null {
  if (v[0] !== 2) return null;
  const setup = setupFromTuple(v[1]);
  const rows: PanelRow[] = v[4].map(([id, level, clone = 1, locked = 0, moduleIds = []]) => {
    if (id.startsWith(CUSTOM)) {
      const name = id.slice(CUSTOM.length);
      return { id, targetId: null, name, level: LEVELS[level] ?? "medium", clone: null, custom: true, locked: locked || null, moduleIds };
    }
    const resolved = clone === 1 ? defaultClone(idx, id, setup) ?? null : clone === 0 ? null : clone;
    return { id, targetId: id, name: idx?.targetsById.get(id)?.name ?? id, level: LEVELS[level] ?? "medium", clone: resolved, custom: !resolved, locked: locked || null, moduleIds };
  });
  return { setup, nSamples: v[2], balanced: !!v[3], rows };
}

export function writeHash(st: UrlState, idx?: Index): void {
  if (typeof window === "undefined") return;
  const h = `#${encodeState(st, idx)}`;
  if (window.location.hash !== h) window.history.replaceState(null, "", h);
}

export function shareUrl(st: UrlState, idx?: Index): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${encodeState(st, idx)}`;
}
