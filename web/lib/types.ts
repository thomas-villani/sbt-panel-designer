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
  kit: { pdv2_kit_id: number | string; raw_name: string } | null;
  markers: ModuleMarker[];
}

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
  clone: string | null; // chosen clone (null = custom conjugation / not in catalogue)
  custom: boolean; // custom conjugation allowed (no catalogue conjugate on a free channel)
  locked: number | null; // mass the user pinned
  moduleIds: string[];
  critical?: boolean;
}

export interface Setup {
  modality: Modality;
  species: Species;
  sampleType: SampleType;
  instrumentId: string;
  viability: boolean; // suspension: cisplatin
  barcoding: boolean; // suspension: Pd barcoding
}
