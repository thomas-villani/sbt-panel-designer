import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Index } from "@/lib/data";
import type { Bundles, PanelRow, Setup } from "@/lib/types";

const DATA = resolve(__dirname, "../public/data");
const read = (f: string) => JSON.parse(readFileSync(resolve(DATA, f), "utf8"));

let cached: Index | null = null;
/** Index over the slim bundles in public/data (built by scripts/build-data.mjs before `npm test`). */
export function index(): Index {
  if (!cached) {
    const bundles: Bundles = { instruments: read("instruments.json"), catalog: read("catalog.json"), modules: read("modules.json").modules };
    cached = new Index(bundles);
  }
  return cached;
}

export const IMC: Setup = { modality: "imaging", species: "human", sampleType: "ffpe", instrumentId: "hyperion_xti", viability: false, barcoding: false, segmentation: true, blocked: [] };
export const CYTOF: Setup = { modality: "suspension", species: "human", sampleType: "pbmc", instrumentId: "cytof_xt", viability: true, barcoding: false, segmentation: true, blocked: [] };

export function rowsFromModule(idx: Index, moduleId: string, setup: Setup): PanelRow[] {
  const m = idx.modulesById.get(moduleId);
  if (!m) throw new Error(`no module ${moduleId}`);
  const rows: PanelRow[] = [];
  for (const k of m.markers) {
    if (k.kind !== "antibody" || k.role === "optional" || !k.target_id || rows.some((r) => r.id === k.target_id)) continue;
    const clone = idx.cloneOptions(k.target_id, setup)[0]?.clone ?? null;
    rows.push({ id: k.target_id, targetId: k.target_id, name: k.target_name, level: k.abundance_level ?? "medium", clone, custom: !clone, locked: null, moduleIds: [m.id] });
  }
  return rows;
}
