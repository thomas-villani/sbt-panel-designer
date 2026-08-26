/**
 * Copies the ETL bundles from ../data/build into public/data, slimming the catalogue to what the UI needs.
 * Run automatically before `next dev` / `next build`.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "../../data/build");
const OUT = resolve(here, "../public/data");
mkdirSync(OUT, { recursive: true });

const read = (f) => JSON.parse(readFileSync(resolve(SRC, f), "utf8"));
const write = (f, obj) => {
  const txt = JSON.stringify(obj);
  writeFileSync(resolve(OUT, f), txt);
  console.log(`${f}: ${(txt.length / 1024).toFixed(0)} KB`);
};

const instruments = read("instruments.json");
write("instruments.json", instruments);

const cat = read("catalog.json");
const skuById = new Map(cat.skus.map((s) => [s.part_number, s]));
const conjugates = cat.conjugates.map((c) => ({
  id: c.id, target_id: c.target_id, clone: c.clone, metal: c.metal, mass: c.mass, application: c.application,
  kind: c.kind, reactivity: c.reactivity, sample_types: c.sample_types, tds_url: c.tds_url ?? null,
  signal: c.st_source === "titrated" ? c.signal : null, tolerance: c.st_source === "titrated" ? c.tolerance : null,
  status: c.status,
  skus: c.skus.map((pn) => {
    const s = skuById.get(pn);
    return { part_number: pn, format: s?.format ?? null };
  }),
}));
const targets = cat.targets.map((t) => ({
  id: t.id, name: t.name, aliases: t.aliases, n_conjugates: t.n_conjugates, applications: t.applications, kinds: t.kinds,
}));
write("catalog.json", { version: cat.version, stats: cat.stats, targets, conjugates });

const mods = read("modules.json");
write("modules.json", {
  version: mods.version,
  modules: mods.modules.filter((m) => !m.hidden).map((m) => ({
    id: m.id, name: m.name, source: m.source, application: m.application, species: m.species, instruments: m.instruments,
    sample_types: m.sample_types, category: m.category, blurb: m.blurb, featured: m.featured,
    aliases: m.aliases ?? [], definition: m.definition ?? null,
    kit: m.kit ? { pdv2_kit_id: m.kit.pdv2_kit_id, raw_name: m.kit.raw_name } : null,
    markers: m.markers.map((k) => ({
      target_id: k.target_id, target_name: k.target_name, kind: k.kind, role: k.role, clone: k.clone, metal: k.metal, mass: k.mass,
      signal: k.signal, tolerance: k.tolerance, st_source: k.st_source, abundance_level: k.abundance_level,
      kit_only: k.kit_only, custom: k.custom, in_catalogue: k.in_catalogue, conjugate_id: k.conjugate_id,
      catalogue_metals: k.catalogue_metals, note: k.note ?? null, polarity: k.polarity ?? "pos",
    })),
  })),
});

// Publications per target (optional: built from a local literature DB, see etl/pd3_etl/pubs.py). Loaded lazily by the UI.
import { existsSync } from "node:fs";
if (existsSync(resolve(SRC, "publications.json"))) {
  const pubs = read("publications.json");
  write("publications.json", pubs);
} else {
  write("publications.json", { version: null, source: null, stats: {}, targets: {} });
  console.log("publications.json: no data/build/publications.json, wrote empty stub");
}
