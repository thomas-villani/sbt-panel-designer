/**
 * The panel document and its codecs. Every panel state is a URL: setup + rows live in the hash (SPEC 6.2), and the same
 * encoding is what localStorage keeps (lib/saved.ts). A future server store will keep the decoded document as JSON.
 *
 * v2 (current): `#~` + base64url(deflate-raw(JSON)). The JSON keeps only what the catalogue cannot rebuild — a row is
 * `[id, level, clone?, locked?, moduleIds?, accepted?, custom?]` with trailing defaults dropped; names come back from the
 * target id, and a clone equal to the catalogue default for the setup is written as `1` and re-resolved on decode. ~7×
 * smaller than v1. The tuple's last slot is the catalogue version the panel was written against, so a decode can say
 * when the catalogue has moved on underneath it.
 * v1 (legacy, still decoded): base64url JSON with every field spelled out. Old share links keep working.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { SAMPLE_TYPES, SPECIES, defaultInstrument, type Index } from "./data";
import type { AbundanceLevel, PanelRow, Setup } from "./types";

/** What a panel *is*, independent of how it is shown: enough to rebuild it against a catalogue. */
export interface PanelDoc {
  setup: Setup;
  rows: PanelRow[];
  nSamples: number;
  /** The user has opened Balance at least once (metals may be shown). UI-ish, but it travels so a share link opens on Balance. */
  balanced: boolean;
  /** `catalog.version` the document was written against; undefined for v1 links and pre-stamp v2 links. */
  catalogVersion?: string;
}
/** @deprecated name from when the hash was the only sink; use PanelDoc. */
export type UrlState = PanelDoc;

/** What decoding tells the caller beyond the document: was there anything to decode, and did the catalogue move? */
export type DecodeResult =
  | { ok: true; doc: PanelDoc; drift: DecodeDrift }
  | { ok: false; reason: "empty" | "unreadable" | "unsupported_version" };
export interface DecodeDrift {
  /** The document names a catalogue version other than the one loaded (only known when both are present). */
  catalogChanged: boolean;
  /** Target ids the loaded catalogue no longer has (rows are kept, shown by id, and marked custom). */
  unknownTargets: string[];
  /** Setup fields that did not validate against the bundle and were reset to a default. */
  resetFields: (keyof Setup)[];
}

const LEVELS: AbundanceLevel[] = ["low", "medium", "high", "very_high"];
const CUSTOM = "custom:";
const V2 = "~";

// Trailing entries are dropped when they hold their default (segmentation on, nothing blocked), so old links still decode.
type SetupTuple = [Setup["modality"], Setup["species"], Setup["sampleType"], string, 0 | 1, 0 | 1, (0 | 1)?, number[]?, (string | 0)?, number[]?]; // 8: viability mode (0 = natural Pt), 9: opted-in metals
type CloneV2 = string | 0 | 1 | [string]; // 0 = custom conjugation; 1 = free (catalogue default, re-resolved on decode); string = pinned; [string] = free but recorded (no catalogue at encode time)
type RowV2 = [string, number, CloneV2?, (number | 0)?, string[]?, string?, (0 | 1)?]; // 5: accepted-spill reason; 6: custom flag when it disagrees with "no clone"
type V2 = [2, SetupTuple, number, 0 | 1, RowV2[], string?]; // 5: catalogue version
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

const setupTuple = (s: Setup): SetupTuple => {
  const mode = s.viabilityMode && s.viabilityMode !== "pt" ? s.viabilityMode : 0;
  const extra = s.extraMetals ?? [];
  const t: SetupTuple = [s.modality, s.species, s.sampleType, s.instrumentId, s.viability ? 1 : 0, s.barcoding ? 1 : 0, s.segmentation ? 1 : 0, s.blocked, mode, extra];
  // Trailing defaults fall off so short links stay short and old links still decode.
  if (!extra.length) { t.pop(); if (mode === 0) { t.pop(); if (!t[7]!.length) { t.pop(); if (t[6] === 1) t.pop(); } } }
  return t;
};
const setupFromTuple = (t: SetupTuple): Setup => ({
  modality: t[0], species: t[1], sampleType: t[2], instrumentId: t[3], viability: !!t[4], barcoding: !!t[5],
  segmentation: t[6] === undefined ? true : !!t[6], blocked: Array.isArray(t[7]) ? t[7] : [],
  ...(t[8] ? { viabilityMode: t[8] as Setup["viabilityMode"] } : {}), ...(Array.isArray(t[9]) && t[9].length ? { extraMetals: t[9] } : {}),
});

/**
 * A setup from a link or a saved panel is untrusted: the instrument may have been renamed, the modality may be a typo.
 * Anything that does not validate against the bundle is reset to a default and reported, so the app never renders
 * against an instrument that does not exist.
 */
export function validateSetup(setup: Setup, idx?: Index): { setup: Setup; resetFields: (keyof Setup)[] } {
  const reset: (keyof Setup)[] = [];
  const s: Setup = { ...setup };
  if (s.modality !== "suspension" && s.modality !== "imaging") { s.modality = "suspension"; reset.push("modality"); }
  if (!SPECIES.some((x) => x.id === s.species)) { s.species = "human"; reset.push("species"); }
  if (!SAMPLE_TYPES[s.modality].some((x) => x.id === s.sampleType)) { s.sampleType = SAMPLE_TYPES[s.modality][0].id; reset.push("sampleType"); }
  if (idx) {
    const inst = idx.instrumentOrNull(s.instrumentId);
    if (!inst || inst.modality !== s.modality) { s.instrumentId = defaultInstrument(idx, s.modality); reset.push("instrumentId"); }
    const known = new Set(idx.instrument(s.instrumentId).channels.map((c) => c.mass));
    const blocked = (s.blocked ?? []).filter((m) => typeof m === "number" && known.has(m));
    if (blocked.length !== (s.blocked ?? []).length) { s.blocked = blocked; reset.push("blocked"); }
    if (s.extraMetals) {
      const extra = s.extraMetals.filter((m) => typeof m === "number" && known.has(m));
      if (extra.length !== s.extraMetals.length) { if (extra.length) s.extraMetals = extra; else delete s.extraMetals; reset.push("extraMetals"); }
    }
  }
  return { setup: s, resetFields: reset };
}

const defaultClone = (idx: Index | undefined, targetId: string, setup: Setup): string | null | undefined =>
  idx ? idx.cloneOptions(targetId, setup)[0]?.clone ?? null : undefined;

/** Encode for the hash / localStorage. With `idx`, default clones are elided (the share link gets shorter) and the catalogue version is stamped. */
export function encodeState(doc: PanelDoc, idx?: Index): string {
  const rows: RowV2[] = doc.rows.map((r) => {
    const id = r.targetId ?? `${CUSTOM}${r.name}`;
    const clone: CloneV2 = r.clone === null ? 0 : r.clonePinned || !r.targetId ? r.clone : idx ? 1 : [r.clone];
    // `custom` normally follows from "no clone"; it is written only when the user pinned a catalogue clone to a metal it is not sold on.
    const customBit: 0 | 1 = r.targetId && r.custom !== !r.clone ? 1 : 0;
    const row: RowV2 = [id, Math.max(0, LEVELS.indexOf(r.level)), clone, r.locked ?? 0, r.moduleIds, r.accepted ?? "", customBit];
    // Drop trailing defaults: default custom, nothing accepted, no modules, no lock, default clone.
    if (row[6] === 0) { row.pop(); if (row[5] === "") { row.pop(); if (row[4]!.length === 0) { row.pop(); if (row[3] === 0) { row.pop(); if (row[2] === 1) row.pop(); } } } }
    return row;
  });
  const version = doc.catalogVersion ?? idx?.bundles.catalog.version;
  const v2: V2 = version ? [2, setupTuple(doc.setup), doc.nSamples, doc.balanced ? 1 : 0, rows, version] : [2, setupTuple(doc.setup), doc.nSamples, doc.balanced ? 1 : 0, rows];
  return V2 + toB64url(deflateSync(strToU8(JSON.stringify(v2)), { level: 9 }));
}

/** Decode a hash (with or without `#`) or a stored string. `idx` rebuilds names and default clones for catalogue rows and validates the setup. */
export function decodeState(hash: string, idx?: Index): PanelDoc | null {
  const r = decodeStateResult(hash, idx);
  return r.ok ? r.doc : null;
}

/** Like decodeState, but says *why* there is no document, and what drifted when there is one. */
export function decodeStateResult(hash: string, idx?: Index): DecodeResult {
  const raw = hash.replace(/^#/, "");
  if (!raw) return { ok: false, reason: "empty" };
  let parsed: unknown;
  try {
    parsed = raw.startsWith(V2) ? JSON.parse(strFromU8(inflateSync(fromB64url(raw.slice(1))))) : JSON.parse(strFromU8(fromB64url(raw)));
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  try {
    if (Array.isArray(parsed)) {
      if (parsed[0] !== 2) return { ok: false, reason: "unsupported_version" };
      return finish(decodeV2(parsed as V2, idx), idx);
    }
    const c = parsed as V1;
    if (!c || c.v !== 1) return { ok: false, reason: "unsupported_version" };
    const doc: PanelDoc = {
      setup: setupFromTuple(c.s), nSamples: c.n, balanced: !!c.b,
      // v1 links wrote the clone the user saw; keep it pinned so an old link still orders what it showed.
      rows: c.r.map(([id, targetId, name, level, clone, custom, locked, moduleIds]) => ({ id, targetId, name, level, clone, custom: !!custom, locked, moduleIds, ...(clone ? { clonePinned: true } : {}) })),
    };
    return finish(doc, idx);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}

function finish(doc: PanelDoc, idx?: Index): DecodeResult {
  const { setup, resetFields } = validateSetup(doc.setup, idx);
  const unknownTargets = idx ? [...new Set(doc.rows.filter((r) => r.targetId && !idx.targetsById.has(r.targetId)).map((r) => r.targetId!))] : [];
  const catalogChanged = !!(idx && doc.catalogVersion && doc.catalogVersion !== idx.bundles.catalog.version);
  const releaseLocks = resetFields.includes("instrumentId") || resetFields.includes("modality"); // locks were on another instrument's channels
  const rows = doc.rows.map((r) => ({
    ...r,
    ...(releaseLocks ? { locked: null } : {}),
    // module references written before kit ids were stable ledger ids are slugs: translate them
    moduleIds: idx ? [...new Set(r.moduleIds.map((m) => idx.moduleId(m)))] : r.moduleIds,
  }));
  return { ok: true, doc: { ...doc, setup, rows }, drift: { catalogChanged, unknownTargets, resetFields } };
}

function decodeV2(v: V2, idx?: Index): PanelDoc {
  const setup = setupFromTuple(v[1]);
  if (!Array.isArray(v[4])) throw new Error("rows missing");
  const rows: PanelRow[] = v[4].map(([id, level, clone = 1, locked = 0, moduleIds = [], accepted = "", customBit = 0]) => {
    if (typeof id !== "string") throw new Error("bad row id");
    const acc = accepted ? { accepted } : {};
    if (id.startsWith(CUSTOM)) {
      const name = id.slice(CUSTOM.length);
      return { id, targetId: null, name, level: LEVELS[level] ?? "medium", clone: null, custom: true, locked: locked || null, moduleIds, ...acc };
    }
    const resolved = clone === 1 ? defaultClone(idx, id, setup) ?? null : clone === 0 ? null : Array.isArray(clone) ? clone[0] : clone;
    const pin = typeof clone === "string" ? { clonePinned: true } : {};
    // A pinned catalogue clone on a metal it is not sold on is still "custom" (the user's own vial): the bit flips the default.
    const custom = customBit ? !!resolved : !resolved;
    return { id, targetId: id, name: idx?.targetsById.get(id)?.name ?? id, level: LEVELS[level] ?? "medium", clone: resolved, custom, locked: locked || null, moduleIds, ...acc, ...pin };
  });
  return { setup, nSamples: typeof v[2] === "number" ? v[2] : 20, balanced: !!v[3], rows, ...(typeof v[5] === "string" ? { catalogVersion: v[5] } : {}) };
}

export function writeHash(doc: PanelDoc, idx?: Index): void {
  if (typeof window === "undefined") return;
  const h = `#${encodeState(doc, idx)}`;
  if (window.location.hash !== h) window.history.replaceState(null, "", h);
}

export function shareUrl(doc: PanelDoc, idx?: Index): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${encodeState(doc, idx)}`;
}
