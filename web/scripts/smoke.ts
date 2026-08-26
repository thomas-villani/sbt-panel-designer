/** Headless walk through SPEC 6.4 (Priya: IMC, human, FFPE) using the same data layer the UI uses. */
import { readFileSync } from "node:fs";
import { balance, buildProblem } from "@pd3/engine";
import { Index, reservedRoles, rowSpec, channelBudget } from "../lib/data";
import type { Bundles, PanelRow, Setup } from "../lib/types";
import { buildBom } from "../lib/bom";
import { decodeState, encodeState } from "../lib/url";

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, "utf8"));
const bundles: Bundles = { instruments: read("instruments.json"), catalog: read("catalog.json"), modules: read("modules.json").modules };
const idx = new Index(bundles);
const setup: Setup = { modality: "imaging", species: "human", sampleType: "ffpe", instrumentId: "hyperion_xti", viability: false, barcoding: false, segmentation: true, blocked: [] };

const mods = idx.modulesFor(setup);
console.log(`modules for imaging/human: ${mods.length}`, mods.slice(0, 8).map((m) => m.name).join(" | "));
const want = ["Tissue architecture", "Basic immune", "Lymphoid", "Myeloid / macrophages", "Functional state", "T-cell exhaustion"];
const rows: PanelRow[] = [];
for (const name of want) {
  const m = mods.find((x) => x.name === name);
  if (!m) { console.log("MISSING module", name); continue; }
  for (const k of m.markers) {
    if (k.kind !== "antibody" || k.role === "optional" || !k.target_id) continue;
    if (rows.some((r) => r.id === k.target_id)) continue;
    const opts = idx.cloneOptions(k.target_id, setup);
    rows.push({ id: k.target_id, targetId: k.target_id, name: k.target_name, level: k.abundance_level ?? "medium", clone: opts[0]?.clone ?? null, custom: !opts.length, locked: null, moduleIds: [m.id] });
  }
}
console.log(`rows after 6 modules: ${rows.length} (budget ${channelBudget(idx, setup)})`);
console.log("suggest next:", idx.suggestNext(rows, setup).map((s) => `${s.name} (${s.reason})`).join("; "));
for (const q of ["granzyme", "PD-L1", "pan-cytokeratin", "CD163"]) console.log(`search ${q}:`, idx.search(q, setup, 3).map((t) => t.name).join(", "));
for (const q of ["Granzyme B", "CD163", "CD31"]) {
  const t = idx.search(q, setup, 1)[0];
  if (t && !rows.some((r) => r.id === t.id)) rows.push({ id: t.id, targetId: t.id, name: t.name, level: "medium", clone: idx.cloneOptions(t.id, setup)[0]?.clone ?? null, custom: false, locked: null, moduleIds: [] });
}
const specs = rows.map((r) => rowSpec(idx, r, setup));
console.log("custom rows:", specs.filter((s) => s.allowCustom).map((s) => s.label).join(", ") || "none");
const problem = buildProblem(bundles.instruments, { instrumentId: setup.instrumentId, rows: specs, reservedRoles: reservedRoles(setup) });
const res = balance(problem, { seed: 1 });
console.log(`balanced ${rows.length} rows in ${res.stats.ms.toFixed(0)} ms: objective ${res.objective.toFixed(3)}, unassigned ${res.unassigned.length}, warnings ${res.warnings.length}`);
for (const w of res.warnings.slice(0, 5)) console.log(` - [${w.severity}] ${w.message}${w.fix ? ` => ${w.fix.message}` : ""}`);
const bom = buildBom(idx, rows, res, setup, 40);
console.log(`BOM: ${bom.filter((l) => l.sku).length} SKUs, ${bom.filter((l) => !l.sku).length} without;`, bom.slice(0, 3).map((l) => `${l.row.name} ${l.metal} ${l.sku?.part_number} x${l.qty}`).join(" | "));
const enc = encodeState({ setup, rows, nSamples: 40, balanced: true });
const dec = decodeState("#" + enc)!;
console.log(`url state ${enc.length} chars, roundtrip ok: ${JSON.stringify(dec.rows) === JSON.stringify(rows)}`);

// Suspension sanity: human PBMC lineage backbone on CyTOF XT.
const s2: Setup = { modality: "suspension", species: "human", sampleType: "pbmc", instrumentId: "cytof_xt", viability: true, barcoding: false, segmentation: true, blocked: [] };
const m2 = idx.modulesFor(s2).find((m) => m.id === "human-pbmc-lineage")!;
const r2: PanelRow[] = m2.markers.filter((k) => k.kind === "antibody" && k.target_id).map((k) => ({ id: k.target_id!, targetId: k.target_id, name: k.target_name, level: k.abundance_level ?? "medium", clone: idx.cloneOptions(k.target_id!, s2)[0]?.clone ?? null, custom: false, locked: null, moduleIds: [m2.id] }));
const res2 = balance(buildProblem(bundles.instruments, { instrumentId: "cytof_xt", rows: r2.map((r) => rowSpec(idx, r, s2)), reservedRoles: reservedRoles(s2) }), { seed: 1 });
console.log(`suspension backbone: ${r2.length} rows, objective ${res2.objective.toFixed(3)}, warnings ${res2.warnings.length}, titrated rows ${r2.map((r) => rowSpec(idx, r, s2)).filter((s) => s.signal != null).length}`);
