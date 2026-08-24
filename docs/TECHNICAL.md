# PD3 — Technical reference

Maxpar Panel Designer v3: a login-optional web tool for designing metal-balanced CyTOF / IMC antibody panels,
replacing pdv2.standardbio.com. Product spec: [`../SPEC.md`](../SPEC.md). This document is the engineering
reference: what exists, how the data flows, and the maths the engine implements.

Status (2026-08-24): Phase 0 (data) and Phase 1 (engine) complete. Phase 2 (web UI) next.

---

## 1. Repository layout

```
SPEC.md                    product + technical specification (source of truth for behaviour)
README.md                  build commands
docs/TECHNICAL.md          this file
docs/review/               human-review sheets produced by the ETL and validation
data/pdv2-api/             raw captures from pdv2 (API responses, harvest CSVs)  — read-only inputs
data/curated/              hand-maintained YAML: instruments, isotopes, aliases, species, modules, kit overrides
data/build/                generated JSON bundles consumed by the engine and the web app (do not edit)
etl/                       Python 3.12 (uv) ETL: pd3_etl package + pytest
engine/                    TypeScript engine (npm, vitest): PO model, optimiser, explanations, kit validation
tools/                     one-off harvest/inspection scripts used to capture pdv2 (node .mjs, python)
web/                       (empty) Next.js static app — Phase 2
```

Git: five commits on `master`, all work committed. Tests: 26 pytest (etl), 12 vitest (engine).

---

## 2. Data pipeline (Phase 0)

### 2.1 Sources

| Source | File(s) | Content |
|---|---|---|
| Store catalogue export | `data/pdv2-api/pdv2-product-table-2026-08-24.csv` + store CSV | 1,822 SKUs: part number, target, clone, metal, application, reactivity, TDS/SDS links |
| pdv2 spillover matrices | `api_spillover_{1..7}.txt` | percent-overlap matrix per instrument (isotopic impurity + oxide M+16 + M±1) |
| pdv2 mass-bias curves | `api_massbias_{0,1}.txt` | relative sensitivity per mass; 0 = suspension, 1 = imaging |
| pdv2 kit contents | `api_kit_contents.json` (IMC), `api_kit_contents_susp.json` | 62 SBT kits/panels with SBT's own metal assignment and per-row S/T |
| pdv2 S/T harvest | `pdv2-conjugate-signal-tolerance-2026-08-24.csv` | 902 conjugates' titrated signal/tolerance (suspension only) |
| Bern IMC guidelines | `data/bern-imc-panel-design-guidelines-2015.pdf` | Fluidigm white paper 13-01 (design rules, oxide/M±1 reasoning) |

Captures are stored verbatim (`"200 <json>"` one-liners, read by `pd3_etl.util.read_pdv2_capture`).

### 2.2 Commands

```
cd etl
uv run pd3-etl instruments   # -> data/build/instruments.json
uv run pd3-etl catalog       # -> data/build/catalog.json
uv run pd3-etl modules       # -> data/build/modules.json  (needs catalog.json)
uv run pytest
```
Order matters: `modules` resolves kit rows against the catalogue. `python` is not on PATH on the dev machine — always `uv run`.

### 2.3 `instruments.json` (148 KB) — `etl/pd3_etl/instruments.py`

```
{ version, sources, isotopes{mass: element},
  po_matrices{ pdv2_id: { donors[], recipients[], pct{donorMass: {recipientMass: percent}}, anomalies[] } },
  sensitivity_curves{ "0"|"1": {mass: rel_sensitivity} },
  instruments[ { id, name, modality, pdv2_id, po_matrix, sensitivity_curve, current, default_for_modality,
                 channels[ { mass, element, label, rel_sensitivity, usable, in_po_matrix, range_class } ] } ],
  reserved{ suspension[]: role, imaging[]: role },   // role = {role, label, masses[], default, hard, note}
  range_classes[] }
```

* Seven instruments from `data/curated/instruments/instruments.yaml`: `cytof_xt` (default suspension), `helios`, `cytof2`, `cytof1`,
  `hyperion_xti` (default imaging), `hyperion_plus`, `hyperion`.
* `pct` stores off-diagonal non-zero cells only. Diagonal `null` for donor 128 is treated as 100 and logged in `anomalies`.
* Channels = PO recipients ∪ reserved masses. `usable = mass in sensitivity curve` (45 on Hyperion XTi, ≥60 on XT).
  Cd (106–116) is usable on suspension instruments only.
* Facts verified by tests: Helios and XT matrices differ in exactly two cells; Hyperion 5/6/7 are identical; oxide Pr141→157 is
  1.5–4 %; M±1 ≤ 5 %; curve 141 = 0.3, 159–169 = 1.0, 209 = 0.7.
* Reserved roles: suspension — DNA Ir 191/193 (default, hard), cisplatin viability 194/195/198 (default, soft), Rh103, Pd barcoding
  102–110 (hard, off by default), EQ beads 140/151/153/165/175 (flag only). Imaging — DNA Ir, segmentation kit Pt 195/196/198
  (default, hard), Ru counterstain.
* Range classes: `bright_only` < 142, `mid` 142–152, `sweet_spot` 153–176, `heavy` > 176.

### 2.4 `catalog.json` (2.9 MB) — `etl/pd3_etl/catalog.py`, `names.py`

Stats: 1,822 SKUs → 1,146 conjugates → 566 clones → 384 targets; 527 of 774 suspension conjugates carry titrated S/T.

```
targets[]     { id, name, aliases[], sources[], n_conjugates, applications[], kinds[] }
clones[]      { ... }
conjugates[]  { id "targetId|clone|metal|s/i", target_id, target_name, clone, metal, mass, application,
                assay_type, kind, reactivity[], sample_types[], skus[], tds_url,
                signal, tolerance, st_source titrated|default, st_context{cell, stim}, status }
skus[]        { part_number, base_part, format_code, format{unit, qty}, raw_target, target_name, kind, clone, metal,
                application, reactivity[], reactivity_flags[], tds, sds, pdv2{product_id, signal, tolerance, ...}, target_id }
```

Normalisation rules (`names.py`):
* `norm_key`: lowercase, Greek folded (α→a, β→b, γ→g, δ→d, ε→e, κ→k, λ→l, μ→u, ζ→z, η→h), `phospho-`→`p`, non-alphanumerics stripped.
* `split_target`: strips `Anti-Human/Mouse/…/Cross` prefixes into species codes; `Goat Anti-X IgG`, Biotin, FITC, PE → kind `secondary`.
* `name_parts`: `CD274/PD-L1` → aliases `CD274`, `PD-L1`; never splits when a later part is numeric or ≤ 1 char
  (`CD16/32`, `CD51/61`, `CD66a/c/e` stay whole); bracketed phospho sites never split.
* Target identity = union-find over keys, merged by: key equality, store↔pdv2 part-number join, `CDnnn/Name` parts,
  and `data/curated/aliases.yaml` (~33 curated groups, e.g. CD3ε, CD8a, PD-L1, CTLA-4, Pan-Cytokeratin, β2M).
  HLA-DR ↔ MHC Class II is deliberately **not** merged.
* Display name: curated canonical wins; otherwise the store spelling with most name parts, then shortest.
* Species: `data/curated/species.yaml` maps every reactivity term to codes (`human`, `mouse`, `rat`, `nhp`, …); `cross` with no
  codes → human+mouse with a `low_confidence` flag. Zero unmapped terms.
* pdv2 placeholders (signal 100, tolerance 1) are marked `st_source: placeholder` and never treated as titrated.

### 2.5 `modules.json` (464 KB) — `etl/pd3_etl/modules.py`

76 modules: 62 SBT kits (36 suspension, 26 IMC) + 14 curated (`data/curated/modules/curated-v0.yaml`).
Kit rows: 640, of which 635 resolve to a catalogue target and 603 to an exact catalogue conjugate.
The 34 non-matching rows are listed in `docs/review/kit-rows-not-in-catalogue.csv` (kit-only conjugates — MDIPA alone has ~10,
so the BOM must treat MDIPA as a single SKU).

```
modules[] { id, slug, name, source sbt_kit|curated, kit{pdv2_kit_id, pdv2_experiment_id, raw_name, ...}|null,
            application suspension|imaging|both, species[], instruments[], sample_types[], category, blurb, featured, hidden,
            markers[ { target_id, target_name, raw_target, kind antibody|segmentation, role required|recommended|optional,
                       clone, metal, mass, signal, tolerance, st_source titrated|default|kit_pill|curated,
                       abundance_level, kit_only, custom, in_catalogue, conjugate_id, catalogue_metals[], note? } ] }
```

* Abundance level from titrated signal: `< 60 low`, `< 150 medium`, `< 400 high`, else `very_high`.
  IMC kits carry pdv2's 33/66/100 "pill" → low/medium/high (`st_source: kit_pill`). IMC has **no** titrated data anywhere in pdv2.
* Kit display metadata (name, category, blurb, featured, hidden) comes from `kit-overrides.yaml`, keyed by raw pdv2 kit name.
* Kit groups carry no population info; exclusivity groups will be derived from lineage knowledge later.
* Curated targets not sold by SBT (TOX, Helios, NKG2A/D, HK2, IgA, CD79B) stay in modules with `in_catalogue: false`.

Review sheets: `docs/review/targets-aliases.csv` (every merge), `docs/review/modules.csv`, `docs/review/kit-rows-not-in-catalogue.csv`.

---

## 3. Engine (Phase 1) — `engine/`

TypeScript, ESM, no runtime dependencies, no I/O: designed to run in a Web Worker. `npm test` (vitest), `npm run typecheck`,
`npm run validate`.

### 3.1 Public API (`src/index.ts`)

```ts
buildProblem(bundle: InstrumentBundle, {
  instrumentId?, modality?,           // default instrument per modality if omitted
  rows: RowSpec[],                    // {id, label, signal?, tolerance?, level?, metals?, allowCustom?, locked?, groups?, unary?, critical?}
  reservedRoles?, extraReserved?, unreserve?, weights?
}): Problem

balance(problem, {iterations?, restarts?, seed?, anneal?}): Result   // optimise + explain
evaluate(problem, assignment: Record<rowId, mass>): Result            // score + explain a given assignment (kit, manual edit)
```

`Result`: `assignment{rowId: mass}`, `score` (full objective), `objective` (pure pdv2 Σ SO/T), `softCost`, `rows[]`
(channel, sensitivity, received SO, received/T, contributions in/out with mechanism, reasons[]), `warnings[]`
(severity, code, message, optional one-click `fix`), `unassigned[]`, `stats`.

### 3.2 Model (`src/po-model.ts`)

pdv2 semantics, per instrument PO matrix:

```
SO(donor → recipient) = S_donor × PO[donor][recipient] / 100        (dual counts)
received(row)         = Σ_donors SO(donor → row)                    (only donors that interact with row)
objective             = Σ_rows received(row) / T(row)
```

Full score = objective (with effective PO) + unary soft terms:

| Term | Definition | Default |
|---|---|---|
| `w_sens` | `w × (1 − rel_sensitivity(channel)) × dimness(row)`, `dimness = 1 / (1 + T/10)`, ×2 if `critical` | 0.2 |
| `w_oxide` | multiplies PO cells with recipient − donor = 16 by `(1 + w)` | 0 |
| `w_adjacent` | multiplies PO cells with |recipient − donor| = 1 by `(1 + w)` | 0 |
| `w_flagged` | added when a row sits on a soft-reserved channel (viability Pt, EQ beads) | 0.05 |
| `row.unary[mass]` | caller-supplied per-channel cost: on-demand / custom / not-in-kit penalties (SPEC w_ondemand, w_custom, w_kit) | — |

`PDV2_WEIGHTS` sets everything to 0 (pure pdv2 objective, used for validation).

Hard constraints: one row per channel; channel ∈ usable ∖ hard-reserved; locked rows fixed (a lock on a reserved/unusable mass
is honoured but produces a `reserved_lock` warning); row domain = catalogue metals for its clone, plus every X8 (89Y, 141–176)
and — on suspension only — MCP9 Cd metal when `allowCustom`.

Group exclusivity (pdv2): rows whose `groups` are both non-empty and disjoint contribute no spillover to each other.

Incremental evaluation: `deltaRelocate` and `deltaSwap` are O(n) using `rowCost(i, c, assign, skip)` and `pairCost`.

### 3.3 Optimiser (`src/optimizer.ts`)

1. **Greedy seed** — locked rows placed; remaining rows ordered by (domain size ≤ 2 first, tolerance ascending); each takes the
   free channel with the lowest `rowCost` given rows placed so far.
2. **Augment** — Kuhn augmenting paths over unlocked rows: guarantees every row is placed whenever a feasible matching exists.
   Rows that still cannot be placed are reported in `unassigned` with a critical warning.
3. **Simulated annealing** — moves: relocate to a free channel in the row's domain, or swap with the occupant when both domains
   allow it. Start temperature = mean |Δ| of 200 sampled moves, geometric cooling to T0/1000, `iterations` steps (default 20k),
   `restarts` independent runs (default 3) from the greedy seed with seeds `seed + 7919·r`. Best-ever kept.
4. **Descent** — best-improvement local search over all relocates and swaps until no move helps (also applied to the seed).

Deterministic for a given seed. ~30–40-row panels solve in tens to a few hundred ms.

### 3.4 Explanations (`src/explain.ts`)

Per row: channel class and relative sensitivity; lock / "only allowed channel" / "chosen from N"; the dominant received
contribution with mechanism (`oxide` M+16, `adjacent` M±1, `isotope` same element, `other`) and its PO %; the largest fraction of
someone else's tolerance the row consumes.

Warnings: `spillover` (≥ 50 % of tolerance = warning, ≥ 100 % = critical) with a **fix** = the best single relocate/swap of the
donor or the recipient that lowers the total score (`bestMoveFor`); when no single move helps the message names the locked rows to
unlock. Also `unassigned`, `flagged_channel` (info), `dim_bright_channel` (T < 10 on a `bright_only` channel), `reserved_lock`.
Because the optimiser ends in a local optimum, fixes mostly appear on evaluated (kit / manual) assignments and on locked rows.

### 3.5 Abundance prior v0 (`src/prior.ts`)

Medians of titrated suspension conjugates per band (527 conjugates, PBMC):

| level | signal | tolerance |
|---|---:|---:|
| low | 30 | 5 |
| medium | 100 | 18 |
| high | 220 | 40 |
| very_high | 700 | 120 |

`signalTolerance(titrated, level)`: titrated wins unless it is the 100/1 placeholder; then the level prior; then `medium`.
IMC uses the same numbers on curated / kit-pill levels — only relative balance matters there. Literature-derived IMC levels are
a planned refinement.

### 3.6 Validation (`scripts/validate-kits.ts` → `docs/review/kit-validation.md`)

Every SBT kit with antibody rows (61) is rebuilt as a problem: rows unlocked, domain = catalogue metals for the clone ∪ the kit's
own metal, titrated S/T where present else the prior, `PDV2_WEIGHTS`, DNA + viability channels hard-reserved (masses a kit itself
uses are released and noted). `evaluate(kitAssignment)` vs `balance()`:

* engine better on **45**, equal on **16**, worse on **0**.
* Largest gains on the IO panels (T-cell complete IO 30.2 → 1.65; MDIPA 10.8 → 4.8; AML 7.2 → 0.08). These are driven by titrated
  tolerances of 3 counts on dim checkpoint markers next to bright neighbours in the kit layout.
* The report lists every move per kit for application-scientist review; kits also encode constraints the objective cannot see
  (lot availability, legacy stability), so "better" is not automatically "should ship".

---

## 4. Conventions and gotchas

* **Windows dev box**: `uv run` for all Python; Node 24 / npm 11. Bash heredocs with non-ASCII or heavy quoting are unreliable —
  write such files with the editor tool. pandas import makes ETL commands take > 60 s the first time; use generous timeouts.
* `pytest | tail` hides the exit code — run `uv run pytest` bare in CI.
* Never hand-edit `data/build/*`; change `data/curated/*` or the ETL and rebuild. Bundle `version` strings are date-stamped.
* Metal labels are normalised to `<mass><Element>` (`145ND` → `145Nd`); the engine keys everything by integer mass.
* Conjugate ids: `targetId|clone|metal|s` (suspension) or `|i` (imaging). Kit rows link via `conjugate_id` when an exact match
  is sold, else `catalogue_metals` lists what is.
* Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## 5. Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Instrument tables, catalogue, modules ETL; review sheets | done |
| 1 | Engine: PO model, optimiser, explanations, kit validation | done |
| 2 | `web/` Next.js static export — Setup → Build → Balance → Order; engine in a Web Worker; Zustand; Tailwind/shadcn | next |
| 2b | GitHub Actions → GitHub Pages demo for SBT stakeholders | next |
| 3 | pdv2 CSV import/export (SPEC §9b), BOM / quote object (MDIPA as one SKU), IMC literature prior, exclusivity groups from lineage | planned |
| 4 | Azure production deploy; WooCommerce / purchasing / SFDC integration — only after UI sign-off | deferred |
