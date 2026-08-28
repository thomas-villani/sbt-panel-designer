/**
 * SPEC 5.6 validation: re-run every SBT kit through the engine with all rows unlocked and compare the
 * pdv2 objective (sum received SO / T) of SBT's own metal assignment with the engine's.
 * Writes docs/review/kit-validation.md.
 *
 * `--check` (npm run validate:check) is the CI gate: it runs the same comparison but writes nothing (the report
 * carries wall-clock timings, so regenerating it would dirty the tree on every run) and exits 1 when
 *   - the engine is worse than SBT on any kit, or
 *   - the kit count / better / equal / worse numbers differ from the header of the committed report.
 * Fix a failure by understanding the change, then running `npm run validate` and committing the new report.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_WEIGHTS, PDV2_WEIGHTS, balance, buildProblem, evaluate } from "../src/index";
import type { InstrumentBundle, Result, RowSpec } from "../src/index";

const CHECK = process.argv.includes("--check");
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const bundle: InstrumentBundle = JSON.parse(readFileSync(resolve(ROOT, "data/build/instruments.json"), "utf8"));
const modules = JSON.parse(readFileSync(resolve(ROOT, "data/build/modules.json"), "utf8")).modules as any[];

const f2 = (x: number) => x.toFixed(2);
const worst = (r: Result) => r.rows.reduce((a, b) => (b.receivedOverT > a.receivedOverT ? b : a), r.rows[0]);

interface KitReport {
  name: string; app: string; instrument: string; n: number; skipped: string[]; unreserved: number[];
  kitObj: number; kitWorst: string; engObj: number; engWorst: string; engMoves: number; engMs: number;
  engDefObj: number; engDefScore: number; engDefMoves: number; moved: string[]; unassigned: string[];
}

const reports: KitReport[] = [];
for (const mod of modules.filter((m) => m.source === "sbt_kit")) {
  const app = mod.application as "suspension" | "imaging";
  const preferred = app === "suspension" ? "cytof_xt" : "hyperion_xti";
  const instrumentId = mod.instruments.includes(preferred) ? preferred : mod.instruments[0] ?? preferred;
  const rows: RowSpec[] = [];
  const kitAssign: Record<string, number> = {};
  const skipped: string[] = [];
  const usedMasses = new Set<number>();
  mod.markers.forEach((mk: any, idx: number) => {
    if (mk.kind !== "antibody" || mk.mass == null) { skipped.push(`${mk.raw_target} (${mk.kind}/${mk.metal ?? "-"})`); return; }
    if (usedMasses.has(mk.mass)) { skipped.push(`${mk.raw_target} duplicate ${mk.metal}`); return; }
    usedMasses.add(mk.mass);
    const id = `${mk.target_id ?? mk.raw_target}#${idx}`;
    const metals = new Set<number>([mk.mass, ...mk.catalogue_metals.map((m: string) => Number(/^\d+/.exec(m)![0]))]);
    rows.push({
      id, label: `${mk.target_name} (${mk.clone ?? "?"})`, signal: mk.signal, tolerance: mk.tolerance, level: mk.abundance_level,
      metals: [...metals],
    });
    kitAssign[id] = mk.mass;
  });
  if (!rows.length) continue;
  // Validation treats every default role (incl. soft viability Pt) as hard: kits never sit on cisplatin channels.
  const roles = bundle.reserved[app].filter((r) => r.default).flatMap((r) => r.masses);
  const unreserved = roles.filter((m) => usedMasses.has(m));

  const problem = buildProblem(bundle, { instrumentId, rows, unreserve: unreserved, extraReserved: roles, weights: PDV2_WEIGHTS });
  const kit = evaluate(problem, kitAssign);
  const eng = balance(problem, { seed: 1 });
  const engDef = balance({ ...problem, weights: DEFAULT_WEIGHTS }, { seed: 1 });
  const moved = rows.filter((r) => eng.assignment[r.id] !== kitAssign[r.id]).map((r) => {
    const rr = eng.rows.find((x) => x.rowId === r.id)!;
    return `${r.label}: ${kitAssign[r.id]} -> ${rr.channel ?? "unassigned"}`;
  });
  const w = (r: Result) => { const x = worst(r); return `${x.label} ${f2(x.receivedOverT)}`; };
  reports.push({
    name: mod.name, app, instrument: instrumentId, n: rows.length, skipped, unreserved,
    kitObj: kit.objective, kitWorst: w(kit), engObj: eng.objective, engWorst: w(eng), engMoves: moved.length, engMs: eng.stats.ms,
    engDefObj: engDef.objective, engDefScore: engDef.score,
    engDefMoves: rows.filter((r) => engDef.assignment[r.id] !== kitAssign[r.id]).length, moved, unassigned: eng.unassigned,
  });
}

const better = reports.filter((r) => r.engObj < r.kitObj - 1e-6).length;
const equal = reports.filter((r) => Math.abs(r.engObj - r.kitObj) <= 1e-6).length;
const worse = reports.filter((r) => r.engObj > r.kitObj + 1e-6);
const totalMs = reports.reduce((s, r) => s + r.engMs, 0);

const lines: string[] = [];
lines.push("# Kit reproduction validation (SPEC 5.6)", "",
  `Engine re-ran ${reports.length} SBT kits with every row unlocked (domain = catalogue metals for the clone + the kit's own metal),`,
  "pdv2 weights (pure sum received SO / T), default reserved channels, seed 1. `def` columns use the default soft weights (w_sens 0.2).", "",
  `* engine better than kit: **${better}**, equal: **${equal}**, worse: **${worse.length}** (${worse.map((r) => r.name).join(", ") || "none"})`,
  `* total engine time: ${totalMs.toFixed(0)} ms (${(totalMs / reports.length).toFixed(0)} ms per kit, 3 restarts x 20k iterations)`, "",
  "| Kit | App | Instrument | Rows | Kit SO/T | Kit worst row | Engine SO/T | Engine worst row | Moves | Def SO/T | Def moves |",
  "|---|---|---|---:|---:|---|---:|---|---:|---:|---:|");
for (const r of reports.sort((a, b) => b.kitObj - a.kitObj)) {
  lines.push(`| ${r.name} | ${r.app} | ${r.instrument} | ${r.n} | ${f2(r.kitObj)} | ${r.kitWorst} | ${f2(r.engObj)} | ${r.engWorst} | ${r.engMoves} | ${f2(r.engDefObj)} | ${r.engDefMoves} |`);
}
lines.push("", "## Per-kit moves (pdv2 weights)", "");
for (const r of reports) {
  lines.push(`### ${r.name} (${r.app}, ${r.instrument}) - kit ${f2(r.kitObj)} -> engine ${f2(r.engObj)}`);
  if (r.unreserved.length) lines.push(`* kit uses reserved mass(es) ${r.unreserved.join(", ")}: released for this run`);
  if (r.skipped.length) lines.push(`* skipped rows: ${r.skipped.join("; ")}`);
  if (r.unassigned.length) lines.push(`* UNASSIGNED: ${r.unassigned.join(", ")}`);
  lines.push(...(r.moved.length ? r.moved.map((m) => `* ${m}`) : ["* no changes"]), "");
}
const out = resolve(ROOT, "docs/review/kit-validation.md");

if (CHECK) {
  const fail = (msg: string) => { console.error(`validate --check FAILED: ${msg}`); process.exit(1); };
  if (worse.length) fail(`engine worse than SBT on ${worse.length} kit(s): ${worse.map((r) => r.name).join(", ")}`);
  let committed: string;
  try {
    committed = readFileSync(out, "utf8");
  } catch {
    fail(`${out} is missing - run \`npm run validate\` and commit it`);
    process.exit(1);
  }
  const counts = /better than kit: \*\*(\d+)\*\*, equal: \*\*(\d+)\*\*, worse: \*\*(\d+)\*\*/.exec(committed);
  const kits = /re-ran (\d+) SBT kits/.exec(committed);
  if (!counts || !kits) fail("cannot read the counts from the committed report header");
  const [wantBetter, wantEqual, wantWorse] = counts!.slice(1).map(Number);
  const wantKits = Number(kits![1]);
  if (wantKits !== reports.length || wantBetter !== better || wantEqual !== equal || wantWorse !== worse.length) {
    fail(
      `counts moved from the committed report (kits ${wantKits}->${reports.length}, better ${wantBetter}->${better}, ` +
      `equal ${wantEqual}->${equal}, worse ${wantWorse}->${worse.length}) - re-run \`npm run validate\` and commit`,
    );
  }
  console.log(`validate --check OK: ${reports.length} kits, ${better} better, ${equal} equal, 0 worse (matches ${out})`);
  process.exit(0);
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log(lines.slice(0, 6).join("\n"));
console.log(`\nwrote ${out}`);
for (const r of reports.sort((a, b) => b.kitObj - a.kitObj).slice(0, 12)) {
  console.log(`${r.name.padEnd(44)} ${r.app.padEnd(10)} n=${String(r.n).padStart(2)} kit ${f2(r.kitObj).padStart(7)} -> eng ${f2(r.engObj).padStart(7)}  moves ${r.engMoves}  worst kit ${r.kitWorst} | eng ${r.engWorst}`);
}
