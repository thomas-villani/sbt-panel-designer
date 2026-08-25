/** Every panel state is a URL: setup + rows are encoded in the hash as base64url JSON (SPEC 6.2). */
import type { AbundanceLevel, PanelRow, Setup } from "./types";

export interface UrlState { setup: Setup; rows: PanelRow[]; nSamples: number; balanced: boolean }

type Compact = {
  v: 1;
  s: [Setup["modality"], Setup["species"], Setup["sampleType"], string, 0 | 1, 0 | 1];
  n: number;
  b: 0 | 1;
  r: [string, string | null, string, AbundanceLevel, string | null, 0 | 1, number | null, string[]][];
};

function toB64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeState(st: UrlState): string {
  const c: Compact = {
    v: 1,
    s: [st.setup.modality, st.setup.species, st.setup.sampleType, st.setup.instrumentId, st.setup.viability ? 1 : 0, st.setup.barcoding ? 1 : 0],
    n: st.nSamples, b: st.balanced ? 1 : 0,
    r: st.rows.map((r) => [r.id, r.targetId, r.name, r.level, r.clone, r.custom ? 1 : 0, r.locked, r.moduleIds]),
  };
  return toB64url(JSON.stringify(c));
}

export function decodeState(hash: string): UrlState | null {
  try {
    const raw = hash.replace(/^#/, "");
    if (!raw) return null;
    const c = JSON.parse(fromB64url(raw)) as Compact;
    if (c.v !== 1) return null;
    return {
      setup: { modality: c.s[0], species: c.s[1], sampleType: c.s[2], instrumentId: c.s[3], viability: !!c.s[4], barcoding: !!c.s[5] },
      nSamples: c.n, balanced: !!c.b,
      rows: c.r.map(([id, targetId, name, level, clone, custom, locked, moduleIds]) => ({ id, targetId, name, level, clone, custom: !!custom, locked, moduleIds })),
    };
  } catch {
    return null;
  }
}

export function writeHash(st: UrlState): void {
  if (typeof window === "undefined") return;
  const h = `#${encodeState(st)}`;
  if (window.location.hash !== h) window.history.replaceState(null, "", h);
}

export function shareUrl(st: UrlState): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${encodeState(st)}`;
}
