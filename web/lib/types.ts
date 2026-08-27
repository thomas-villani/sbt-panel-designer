/** Shapes of the slimmed bundles in public/data (see scripts/build-data.mjs). */
import type { AbundanceLevel, InstrumentBundle, Modality } from "@pd3/engine";

export type { AbundanceLevel, InstrumentBundle, Modality };

export type Species = "human" | "mouse" | "nhp" | "rat" | "other";
export type SampleType = "pbmc" | "whole_blood" | "bone_marrow" | "tumour" | "ffpe" | "frozen";

export interface Target {
  id: string;
  name: string;
  aliases: string[];
  n_conjugates: number;
  applications: string[];
  kinds: string[];
}

export interface Sku {
  part_number: string;
  format: { raw: string; unit: string; qty: number } | null;
}

export interface Conjugate {
  id: string;
  target_id: string;
  clone: string;
  metal: string;
  mass: number;
  application: "suspension" | "imaging";
  kind: "antibody" | "secondary";
  reactivity: string[];
  sample_types: string[];
  tds_url: string | null;
  signal: number | null; // titrated only
  tolerance: number | null;
  status: string;
  skus: Sku[];
}

export interface Catalog {
  version: string;
  stats: Record<string, unknown>;
  targets: Target[];
  conjugates: Conjugate[];
}

export interface ModuleMarker {
  target_id: string | null;
  target_name: string;
  kind: "antibody" | "segmentation";
  role: "required" | "recommended" | "optional";
  clone: string | null;
  metal: string | null;
  mass: number | null;
  signal: number | null;
  tolerance: number | null;
  st_source: string;
  abundance_level: AbundanceLevel | null;
  kit_only: boolean;
  custom: boolean;
  in_catalogue: boolean;
  conjugate_id: string | null;
  catalogue_metals: string[];
  note: string | null;
  polarity: "pos" | "neg"; // neg: a lineage negative carried so the gate is clean (cell-type modules)
  applications: string[]; // which modalities the target is sold for ("imaging" / "suspension"); [] when not in the catalogue
}

export interface PanelModule {
  id: string;
  name: string;
  source: "sbt_kit" | "curated";
  application: "suspension" | "imaging" | "both";
  species: string[];
  instruments: string[];
  sample_types: string[];
  category: string;
  blurb: string;
  featured: boolean;
  aliases: string[]; // extra search terms ("Dendritic cell", "pDC")
  definition: string | null; // gating shorthand for cell-type modules ("CD3+ CD4+ CD8-")
  kit: { pdv2_kit_id: number | string; raw_name: string } | null;
  markers: ModuleMarker[];
}

/** Papers per target from the literature DB (public/data/publications.json, loaded on demand). */
export interface PubWork { id: string; doi: string | null; title: string; year: number | null; venue: string | null; cited: number; techniques: string[] }
export interface PubTarget { n: number; by_technique: Record<string, number>; works: PubWork[] }
export interface Publications { version: string | null; source: { db: string; techniques: string[]; works_scanned: number } | null; stats: Record<string, unknown>; targets: Record<string, PubTarget> }

export interface Bundles {
  instruments: InstrumentBundle;
  catalog: Catalog;
  modules: PanelModule[];
}

/** One marker in the user's panel. Metals are never stored here as input: only `locked` (a user decision) is. */
export interface PanelRow {
  id: string; // stable row id (target id, or target id + suffix)
  targetId: string | null; // null when the marker is not in the catalogue at all
  name: string;
  level: AbundanceLevel;
  clone: string | null; // the clone in play (null = custom conjugation / not in catalogue). Unless pinned, the optimiser may swap it.
  /** The user (or a kit) chose this clone: keep it. Otherwise every catalogue clone is on the table and `clone` is whichever the balance landed on. */
  clonePinned?: boolean;
  custom: boolean; // custom conjugation allowed (no catalogue conjugate on a free channel)
  locked: number | null; // mass the user pinned
  moduleIds: string[];
  critical?: boolean;
  /** The user looked at the spill this marker receives and decided it is fine; the reason travels with the panel. */
  accepted?: string | null;
}

export interface Setup {
  modality: Modality;
  species: Species;
  sampleType: SampleType;
  instrumentId: string;
  viability: boolean; // suspension: cisplatin
  barcoding: boolean; // suspension: Pd barcoding
  segmentation: boolean; // imaging: Maxpar cell segmentation kit (3 Pt channels)
  /** Masses deliberately kept empty (an RPT nuclide, a reagent the designer does not model). Hard-reserved. */
  blocked: number[];
}
