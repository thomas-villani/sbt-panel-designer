/** Bundle loading, indexing, clone defaulting and search. Pure functions over the slim bundles. */
import type { RowSpec } from "@pd3/engine";
import type {
  AbundanceLevel, Bundles, Catalog, Conjugate, InstrumentBundle, ModuleMarker, PanelModule, PanelRow, Publications, Setup, Species, Target,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export async function loadBundles(): Promise<Bundles> {
  const get = async <T,>(f: string): Promise<T> => {
    const r = await fetch(`${BASE}/data/${f}`);
    if (!r.ok) throw new Error(`failed to load ${f}: ${r.status}`);
    return r.json();
  };
  const [instruments, catalog, mods] = await Promise.all([
    get<InstrumentBundle>("instruments.json"), get<Catalog>("catalog.json"), get<{ modules: PanelModule[] }>("modules.json"),
  ]);
  return { instruments, catalog, modules: mods.modules };
}

/** Papers per target: ~1 MB, fetched only when the UI first needs it. Missing file = no badges. */
export async function loadPublications(): Promise<Publications> {
  try {
    const r = await fetch(`${BASE}/data/publications.json`);
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  } catch {
    return { version: null, source: null, stats: {}, targets: {} };
  }
}

const GREEK: Record<string, string> = { α: "a", β: "b", γ: "g", δ: "d", ε: "e", κ: "k", λ: "l", μ: "u", ζ: "z", η: "h" };
export function normKey(s: string): string {
  return s.toLowerCase().replace(/[αβγδεκλμζη]/g, (c) => GREEK[c] ?? c).replace(/phospho-/g, "p").replace(/[^a-z0-9]/g, "");
}

export class Index {
  readonly targetsById = new Map<string, Target>();
  readonly conjugatesByTarget = new Map<string, Conjugate[]>();
  readonly modulesById = new Map<string, PanelModule>();
  readonly modulesByTarget = new Map<string, PanelModule[]>();
  private readonly keys: { key: string; target: Target }[] = [];

  constructor(readonly bundles: Bundles) {
    for (const t of bundles.catalog.targets) {
      this.targetsById.set(t.id, t);
      this.keys.push({ key: normKey(t.name), target: t });
      for (const a of t.aliases) this.keys.push({ key: normKey(a), target: t });
    }
    for (const c of bundles.catalog.conjugates) {
      const arr = this.conjugatesByTarget.get(c.target_id) ?? [];
      arr.push(c);
      this.conjugatesByTarget.set(c.target_id, arr);
    }
    for (const m of bundles.modules) {
      this.modulesById.set(m.id, m);
      for (const k of m.markers) {
        if (!k.target_id) continue;
        const arr = this.modulesByTarget.get(k.target_id) ?? [];
        if (!arr.includes(m)) arr.push(m);
        this.modulesByTarget.set(k.target_id, arr);
      }
    }
  }

  get instruments() { return this.bundles.instruments; }

  instrument(id: string) { return this.instruments.instruments.find((i) => i.id === id)!; }

  /** Catalogue conjugates usable for this target under the current setup (application + species). */
  candidates(targetId: string, setup: Setup): Conjugate[] {
    const all = this.conjugatesByTarget.get(targetId) ?? [];
    return all.filter((c) => c.application === setup.modality && c.kind === "antibody" && speciesOk(c.reactivity, setup.species));
  }

  /** Clone options for a target, best default first (most conjugates, then sample-type validated). */
  cloneOptions(targetId: string, setup: Setup): CloneOption[] {
    const by = new Map<string, Conjugate[]>();
    for (const c of this.candidates(targetId, setup)) by.set(c.clone, [...(by.get(c.clone) ?? []), c]);
    const opts: CloneOption[] = [...by.entries()].map(([clone, conjugates]) => ({
      clone, conjugates,
      sampleValidated: setup.modality === "imaging" && conjugates.some((c) => c.sample_types.includes(setup.sampleType)),
      reactivity: [...new Set(conjugates.flatMap((c) => c.reactivity))],
      metals: conjugates.map((c) => c.metal).sort((a, b) => Number.parseInt(a) - Number.parseInt(b)),
      tds: conjugates.find((c) => c.tds_url)?.tds_url ?? null,
    }));
    return opts.sort((a, b) => Number(b.sampleValidated) - Number(a.sampleValidated) || b.conjugates.length - a.conjugates.length || a.clone.localeCompare(b.clone));
  }

  /** Free-text search over target names and aliases; prefix matches first. */
  search(query: string, setup: Setup, limit = 12): Target[] {
    const q = normKey(query);
    if (!q) return [];
    const scored = new Map<string, number>();
    for (const { key, target } of this.keys) {
      if (!target.applications.includes(setup.modality)) continue;
      let s = 0;
      if (key === q) s = 3; else if (key.startsWith(q)) s = 2; else if (key.includes(q)) s = 1;
      if (s > scored.get(target.id)! || (s && !scored.has(target.id))) scored.set(target.id, s);
    }
    return [...scored.entries()].sort((a, b) => b[1] - a[1] || this.targetsById.get(a[0])!.name.localeCompare(this.targetsById.get(b[0])!.name))
      .slice(0, limit).map(([id]) => this.targetsById.get(id)!);
  }

  /** Modules and kits that already contain this target, relevant to the setup first ("which panels is FAP already in?"). */
  modulesWith(targetId: string, setup: Setup): PanelModule[] {
    const fits = new Set(this.modulesFor(setup));
    return (this.modulesByTarget.get(targetId) ?? []).filter((m) => fits.has(m))
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));
  }

  /** Every catalogue target sold for this setup's modality, name-sorted (the "see everything" table). */
  allTargets(setup: Setup): Target[] {
    return this.bundles.catalog.targets.filter((t) => t.applications.includes(setup.modality) && t.kinds.includes("antibody"))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Modules whose name or aliases match the query ("dendritic" finds Dendritic cells), best match first.
   *  `anyModality` searches modules for the species regardless of modality, for a "suspension only" hint when nothing fits. */
  searchModules(query: string, setup: Setup, limit = 4, anyModality = false): PanelModule[] {
    const q = normKey(query);
    if (q.length < 2) return []; // 2 chars so "IO" finds the immuno-oncology panels
    const scored: [PanelModule, number][] = [];
    const here = new Set(this.modulesFor(setup));
    const pool = anyModality
      ? this.bundles.modules.filter((m) => !here.has(m) && (m.species.length === 0 || setup.species === "other" || m.species.includes(setup.species)))
      : [...here];
    for (const m of pool) {
      const keys = [m.name, ...m.aliases].map(normKey);
      let s = 0;
      for (const k of keys) s = Math.max(s, k === q ? 4 : k.startsWith(q) ? 3 : q.startsWith(k) && k.length >= 4 ? 2 : k.includes(q) ? 1 : 0);
      if (q.length < 3 && s < 3) continue; // "IO" must match a whole alias, not any name containing i-o (neurodegeneratIOn)
      if (s) scored.push([m, s + (m.category === "celltype" ? 0.5 : 0)]);
    }
    return scored.sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name)).slice(0, limit).map(([m]) => m);
  }

  /** Modules relevant to the setup, featured first. Modules whose own definition falls apart here are left out entirely. */
  modulesFor(setup: Setup): PanelModule[] {
    return this.bundles.modules.filter((m) =>
      (m.application === "both" || m.application === setup.modality) &&
      (m.species.length === 0 || setup.species === "other" || m.species.includes(setup.species)) &&
      !definitionBroken(m, setup),
    ).sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));
  }

  /** Markers that modules overlapping the panel would add next (poor man's "people also chose"). */
  suggestNext(rows: PanelRow[], setup: Setup, limit = 6): Suggestion[] {
    const have = new Set(rows.map((r) => r.targetId).filter(Boolean));
    if (!have.size) return [];
    const score = new Map<string, { n: number; via: string; name: string }>();
    for (const m of this.modulesFor(setup)) {
      const ids = m.markers.map((k) => k.target_id).filter((x): x is string => !!x);
      const overlap = ids.filter((id) => have.has(id)).length;
      if (overlap < 2) continue;
      for (const k of m.markers) {
        if (!k.target_id || have.has(k.target_id) || !k.in_catalogue || k.kind !== "antibody" || !k.applications.includes(setup.modality)) continue;
        const cur = score.get(k.target_id);
        const w = overlap / ids.length;
        if (!cur) score.set(k.target_id, { n: w, via: m.name, name: k.target_name });
        else cur.n += w;
      }
    }
    return [...score.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, limit)
      .map(([targetId, s]) => ({ targetId, name: s.name, reason: `in ${s.via}` }));
  }
}

/**
 * A module is misleading when a marker its own definition names cannot be added under this setup: "Dendritic cells" that
 * cannot separate pDCs (no CD123 for IMC) is worse than no module at all, so `modulesFor` drops it rather than showing a
 * gap. Only `recommended` markers count - `optional` ones appear in definitions in parentheses and are never auto-added,
 * and `required` ones are always added (as a custom conjugation when nothing is sold).
 */
function definitionBroken(m: PanelModule, setup: Setup): boolean {
  if (!m.definition) return false;
  const def = normKey(m.definition);
  return m.markers.some((k) => k.kind === "antibody" && k.role === "recommended" && markerPlan(k, setup) === "skip" &&
    [k.target_name, ...k.target_name.split("/")].map(normKey).filter((s) => s.length > 2).some((s) => def.includes(s)));
}

/** What adding this module marker does under the setup: add from the catalogue, add as a custom conjugation, or skip. */
export function markerPlan(k: ModuleMarker, setup: Setup): "catalogue" | "custom" | "skip" {
  if (k.kind !== "antibody" || k.role === "optional") return "skip";
  if (k.in_catalogue && k.applications.includes(setup.modality)) return "catalogue";
  return k.role === "required" ? "custom" : "skip"; // a recommended marker not sold for this modality is left out
}

export interface CloneOption {
  clone: string;
  conjugates: Conjugate[];
  sampleValidated: boolean;
  reactivity: string[];
  metals: string[];
  tds: string | null;
}
export interface Suggestion { targetId: string; name: string; reason: string }

function speciesOk(reactivity: string[], species: Species): boolean {
  if (species === "other") return true;
  return reactivity.includes(species);
}

export function levelFromSignal(signal: number | null | undefined): AbundanceLevel | null {
  if (signal == null) return null;
  return signal < 60 ? "low" : signal < 150 ? "medium" : signal < 400 ? "high" : "very_high";
}

export const LEVEL_LABEL: Record<AbundanceLevel, string> = { low: "dim", medium: "medium", high: "bright", very_high: "very bright" };
export const LEVELS: AbundanceLevel[] = ["low", "medium", "high", "very_high"];

/** Median titrated S/T across a clone's conjugates (metal-independent estimate). */
export function titratedST(conjugates: Conjugate[]): { signal: number; tolerance: number } | null {
  const s = conjugates.filter((c) => c.signal != null && c.tolerance != null);
  if (!s.length) return null;
  const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  return { signal: med(s.map((c) => c.signal!)), tolerance: med(s.map((c) => c.tolerance!)) };
}

/** Engine row spec for a panel row under the current setup. */
export function rowSpec(idx: Index, row: PanelRow, setup: Setup): RowSpec {
  const opt = row.targetId && row.clone ? idx.cloneOptions(row.targetId, setup).find((o) => o.clone === row.clone) : undefined;
  const st = opt ? titratedST(opt.conjugates) : null;
  // Only trust titration when the user has not overridden the level away from what it implies.
  const useTitrated = st && levelFromSignal(st.signal) === row.level;
  return {
    id: row.id, label: row.name,
    signal: useTitrated ? st.signal : null, tolerance: useTitrated ? st.tolerance : null, level: row.level,
    metals: opt ? opt.conjugates.map((c) => c.mass) : [],
    allowCustom: row.custom || !opt,
    locked: row.locked, critical: row.critical,
  };
}

/** Reserved role ids enabled by the setup toggles. */
export function reservedRoles(setup: Setup): string[] {
  if (setup.modality === "imaging") {
    const roles = ["dna_intercalator"];
    if (setup.segmentation) roles.push("segmentation_kit");
    return roles;
  }
  const roles = ["dna_intercalator"];
  if (setup.viability) roles.push("viability_cisplatin");
  if (setup.barcoding) roles.push("barcoding_pd");
  return roles;
}

/** A channel the instrument detects *and* SBT sells a conjugation metal for: the only kind an antibody can occupy. */
export function antibodyChannel(c: { usable: boolean; antibody?: boolean }): boolean {
  return c.usable && c.antibody !== false;
}

export interface BudgetLine { label: string; masses: number[] }
export interface Budget {
  instrument: string;
  /** Masses SBT offers a conjugation metal for on this modality (and the instrument detects). */
  antibody: number;
  /** antibody channels + the scaffolding channels (Ir DNA, Pt viability/segmentation, Pd barcodes) currently switched on. */
  total: number;
  lines: BudgetLine[]; // what each reservation takes off the total
  blocked: number[]; // channels the user is keeping empty
  available: number;
}

/**
 * The channel count, itemised, so "~38" can show its working the way SBT quotes it: on IMC, 41 conjugation metals plus
 * the two Ir DNA channels make 43 channels; the Ir and the segmentation kit's three Pt leave 38 for antibodies.
 * Channels the instrument detects but SBT sells no conjugation metal for (157Gd; 194Pt/197Au on IMC) are not counted.
 */
export function channelBudgetDetail(idx: Index, setup: Setup): Budget {
  const inst = idx.instrument(setup.instrumentId);
  const pool = new Set(inst.channels.filter(antibodyChannel).map((c) => c.mass));
  const antibody = pool.size;
  let scaffoldOnly = 0;
  const enabled = reservedRoles(setup);
  const lines: BudgetLine[] = [];
  for (const r of idx.instruments.reserved[setup.modality]) {
    if (!enabled.includes(r.role)) continue;
    for (const m of r.masses) {
      if (pool.has(m)) pool.delete(m);
      else scaffoldOnly++;
    }
    lines.push({ label: r.label, masses: r.masses });
  }
  const blocked = (setup.blocked ?? []).filter((m) => pool.has(m));
  for (const m of blocked) pool.delete(m);
  return { instrument: inst.name, antibody, total: antibody + scaffoldOnly, lines, blocked, available: pool.size };
}

/** Channels available for antibodies: conjugation metals minus everything reserved. */
export function channelBudget(idx: Index, setup: Setup): number {
  return channelBudgetDetail(idx, setup).available;
}

/** Channel label ("176Yb") for a mass on the current instrument. */
export function channelLabel(idx: Index, setup: Setup, mass: number): string {
  return idx.instrument(setup.instrumentId).channels.find((c) => c.mass === mass)?.label ?? String(mass);
}

export function defaultInstrument(idx: Index, modality: Setup["modality"]): string {
  const list = idx.instruments.instruments;
  return (list.find((i) => i.modality === modality && i.default_for_modality) ?? list.find((i) => i.modality === modality)!).id;
}

export const SPECIES: { id: Species; label: string }[] = [
  { id: "human", label: "Human" }, { id: "mouse", label: "Mouse" }, { id: "nhp", label: "Non-human primate" },
  { id: "rat", label: "Rat" }, { id: "other", label: "Other / any" },
];
export const SAMPLE_TYPES: Record<Setup["modality"], { id: Setup["sampleType"]; label: string }[]> = {
  suspension: [
    { id: "pbmc", label: "PBMC" }, { id: "whole_blood", label: "Whole blood" },
    { id: "bone_marrow", label: "Bone marrow" }, { id: "tumour", label: "Dissociated tissue / tumour" },
  ],
  imaging: [{ id: "ffpe", label: "FFPE" }, { id: "frozen", label: "Frozen" }],
};
