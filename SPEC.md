# Maxpar Panel Designer v3 ("PD3") — Product & Technical Specification

Status: draft v0.1, 2026-08-24. Author: Tom Villani (with Claude). Intended home: a new standalone repo; this file is the seed.
Audience: whoever builds it (likely Tom + one contractor/AI-assisted dev), SBT mass-cytometry reagents + FAS team post-close.

---

## 0. One-paragraph summary

Replace the 2014-era Maxpar Panel Designer (pdv2.standardbio.com, a Laravel app inherited from DVS Sciences) with a public, login-optional web tool where a biologist describes *what they want to see* (species, sample type, instrument, biological themes) and gets back a metal-balanced, orderable panel in under five minutes. The current tool's genuinely good part, the signal-overlap/tolerance optimization engine, is preserved and reimplemented; the bad part, adding antibodies one at a time with every attribute picked by hand, is replaced by functional modules, search, and recommendations. The output is a bill of materials that drops straight into the store / a Salesforce quote, plus a CSV the instrument software can import.

Why it matters commercially (see `wiki/strategy/ai-ideas.md`): panel design is the activation-energy barrier for every new CyTOF/IMC experiment, FAS time is consumed by it, and a free public designer captures prospects and their biology before they ever talk to sales.

---

## 1. What exists today (pdv2)

Evidence: `data/maxpar-panel-designer-user-guide-100-9557.pdf` (PN 100-9557 A2, © Fluidigm 11/2014, still the guide linked from standardbio.com/resources/panel-design); a live logged-in pass over CDP on 2026-08-24 (`screenshots/`, `data/pdv2-api/`). Stack: Laravel (Blade + jQuery 2.2.4 + jQuery UI 1.10 + DataTables 1.10 + Semantic UI + FontAwesome Pro), server-rendered pages with ad-hoc `$.ajax` POST endpoints, GTM/GA4.

### 1.0 What the live tool looks like today (differs from the 2014 guide)
- **My Panels** (`/`): table of panels with instrument, reactivity, marker count; Duplicate / Delete / Import / Export / Quote Request. *Create New Panel* modal: Title, Reactivity checkboxes (Human, Mouse, Rat, Rabbit), Instrument Type (`1 Helios, 2 CyTOF, 3 CyTOF2, 4 CyTOF XT, 5 Hyperion, 6 Hyperion+, 7 Hyperion XTi`), Channel Range 75–209. Instrument choice implies panel type: suspension vs imaging (`panel_type` 1 = IMC).
- **Panel Table** (`/experiment/{id}`): rows = Target, Clone (`C11 [FFPE]`), Tag (`148Nd (FDM)`), Custom checkbox, **Target Abundance** dropdown (Low = 33, Medium = 66, High = 100; this replaced the raw Signal/Tolerance fields of the 2014 guide), a group icon; a colour bar per row shows channel sensitivity (green/yellow/orange); right-hand signal-overlap matrix with a "Sensitivity" strip. Buttons: *Quick Add* (inline target/clone/tag/abundance form), *Advanced Search* (a 35-page DataTable of every product: Product, Species, Category FFPE/Frozen, Target, Size, Clone, Tag, Product Number, Test Species, with per-column filter boxes and checkboxes → *Add Selected*), *Import Panel* (kits + your panels), Expand, Delete, Export, Quote Request, Auto-save. Screenshot: `screenshots/05__experiment_216732.png`, `dlg_quickadd.png`, `dlg_advsearch.png`.
- **Panel Wheel** (`/experiment/chart/{id}`): the donut plus a vertical "Target Selection Slider" listing empty channels 89 → 209. `screenshots/side__experiment_chart_216732.png`.
- **Manage Groups** (`/experiment/group/{id}`): checkbox lists per group. `side__experiment_group_216732.png`.
- **My Catalogs** (`/catalog`) and **Manage Metals** (`/catalog/metals`, custom tag list with impurity editor: Add Metal, Manage Impurity, Optimize Available/Unavailable).
- Endpoints observed (all POST, CSRF token in `meta[name=csrf-token]`, plain JSON/HTML bodies): `/massbias/get/{panel_type}`, `/spillover/get_customer/{instrument}`, `/node/get_exp_nodes/{exp}/{order}/{dec}`, `/node/set`, `/node/set_product`, `/node/delete`, `/product/get_labels_by_target`, `/product/get_signal_tolerance`, `/experiment/get_kits/{exp}`, `/experiment/set_add_kit/`, `/experiment/open_channels`, `/experiment/run_tolerance_order_by_abundance/{exp}`, `/optimize/pre_check`, `/optimize/run_best_fit`, `/experiment/export_panel_multiple/`, `/group/get_ref_list/{exp}`, `/experiment/set_{title,description,instrument,tol,order,auto,hide,reactivity}`. Full list in `data/pdv2-api/network.log` and the page source.

### 1.1 Workflow as shipped (per the 2014 guide; still accurate except where §1.0 says otherwise)
1. Register/login (required even to look).
2. **My Panels**: create a panel with title, **Reactivity** (species) and **Instrument Type** (selects the percent-overlap matrix; CyTOF 1 vs CyTOF 2/Helios have different abundance sensitivities) and a default channel range.
3. **Panel Table**: click *Add Target*, type target, pick clone (`target *clone*` syntax), pick tag from a dropdown limited to catalogue preconjugates, or `(any)`; or tick *Custom* and pick any Maxpar labelling-kit tag. Each row carries **Signal** and **Tolerance** values (defaults 80/16; catalogue products have production-determined values preloaded).
4. **Signal Overlap matrix** on the right: rows = tags, columns = channels, values in counts; bottom row = total SO received per channel, heat-mapped as % of that channel's tolerance.
5. **Optimize Metals**: assigns tags to all `(any)` rows by minimizing tolerance-normalized signal overlap. Targets with pre-assigned tags are not moved. If every catalogue tag for a target conflicts, it falls back to a custom tag and tells you.
6. **Panel Wheel**: channels arranged on a ring by tolerance zone, tile height = channel sensitivity, colour = SO as % of tolerance; click a tile to see donor/recipient lines.
7. **Groups**: declare mutually exclusive cell populations (CD8 T vs CD4 T vs B); SO between targets in distinct groups is ignored by the optimizer.
8. **Add Panel** to merge a purchasable Panel Kit or a saved personal panel.
9. **Quote Request**: form → PDF → *email the PDF to sales@*. Test-size selection, labelling-kit vs custom-conjugation-service radio buttons, accessory reagents (buffers, barcoding, intercalator, IdU, viability, beads).
10. **My Catalogs**: import personal conjugate catalogues from a CSV template.
11. Export/import panels as CSV for sharing and for CyTOF instrument software.

### 1.2 The model underneath (keep this)
- Per-instrument **percent overlap (PO) matrix**, tag × channel, combining isotopic impurity, oxide (M+16) and abundance sensitivity (M±1).
- `SO(donor→recipient) = S_donor × PO/100`, summed per recipient channel.
- **Signal** S = expected 75th-percentile dual counts of the brightest-expressing population.
- **Tolerance** T = 0.2 × S75 of the *dimmest* expressing population; for inducible antigens `T = 0.2 × [S75L + 0.1 × (S75H − S75L)]`.
- Optimizer objective: minimize Σ over channels of (received SO / T), with pairwise SO zeroed between targets in distinct groups.
- Mass-response curve: ion optics tuned for 153–176 Da; Tb159 transmits ~3× La139 and ~1.5× Yb176. Oxide formation strongest for La/Ce/Pr/Nd (2–3% M+16), weakest for Eu (<0.1%).

### 1.3 Why it is not useful (what to fix)
| Problem | Consequence |
|---|---|
| Login wall before anything | Zero prospect capture, zero SEO, FAS can't send a link |
| One target at a time, clone syntax `*RPA-T8*`, metal dropdown per row | 35-marker panel = 35 × 4 interactions before any optimization |
| No biology layer: no modules, no "what goes with this", no abundance knowledge | User must already know the answer to use the tool |
| Signal/Tolerance are raw dual-count numbers the user is told to titrate empirically | Nobody edits them; the optimizer runs on defaults of 80/16 for anything not in catalogue |
| Species is a single dropdown, no sample-type (PBMC/whole blood/FFPE/frozen), no IMC vs suspension distinction at the biology level | IMC users see irrelevant suspension conjugates and vice versa |
| Instrument list predates CyTOF XT and Hyperion XTi | Overlap matrices are stale for the current fleet |
| Quote = PDF emailed to a mailbox | No store integration, no price visibility, no funnel analytics |
| Catalogue inside the tool is a separate database from the store | Availability/discontinuation drift; OnDemand (~300 SKUs) likely absent |
| Wheel visualisation is clever but unreadable for >30 channels | Users use the table |
| No mobile, no share links, no versioning, no team spaces | Collaboration happens by emailing CSVs |

---

## 2. Product goals and non-goals

**Goals**
1. Time-to-first-balanced-panel < 5 minutes for a typical 30–40 marker immune panel, no login.
2. Every panel is orderable: catalogue part numbers, test sizes, OnDemand lead times, custom-conjugation line items, accessories.
3. Preserve or beat pdv2's optimization quality (same PO-matrix model, better priors on signal/tolerance).
4. Public and indexable: functional module pages ("T-cell exhaustion panel for human FFPE") are SEO landing pages that end in a pre-built panel.
5. Feed the funnel: save/share/quote require email; capture species, sample type, instrument, themes.
6. Make FAS faster: FAS can build, annotate and send a panel link; internal validated panels become curated starting points.

**Non-goals (v1)**
- Spectral flow or any non-metal chemistry (design the schema so a `modality` field exists; do not build it).
- Replacing instrument acquisition templates beyond CSV export.
- Antibody titration/QC data capture (v2: let users upload their titration signal values to refine priors).
- Pricing display if SBT commercial policy forbids it; the BOM must still work without prices.

---

## 3. Data sources and how to get them

### 3.1 Antibody catalogue (public, solved)
`store.standardbio.com` is WordPress + wpDataTables (table_id=14). The table is fed by a public CSV linked from the landing page:

`https://store.standardbio.com/wp-content/uploads/2026/07/SBI-Product-Catalog-Master-Sheet-Developer-Antibodies-july-29.csv`

Snapshot: `data/sbt-catalog-master-2026-07-29.csv`, 1,821 rows. Columns: `Application, Part Number, Target, Clone, Metal, Reported Reactivity, Format, Technical Data Sheet, Safety Data Sheet, Sample Type, Assay Type`. TDS/SDS cells are `<a>` tags to fluidigm.my.salesforce.com content links; Clone is wrapped in `<div>`.

Profile of the snapshot:
- Application: CyTOF (Cytometry) 1,450 / IMC (Imaging) 372.
- Assay Type: Maxpar 1,519 / MaxparOnDemand 303.
- Format: 25 Tests 679, 100 Tests 587, 50 Tests 91 (suspension); 15 µg 213, 25 µg 159, 25 µL 90 (IMC/OnDemand).
- 52 distinct metals; ~505 distinct target strings; **222 targets offered on more than one metal** (CD45 on 19).
- Reactivity is free text: "Human", "Mouse", "Human, Mouse, Rat", "Human, African Green, Baboon, Cynomolgus, Rhesus", "All species", "Cross"…

Part-number encoding (derived, verify with SBT):
- Maxpar: `3MMMnnnX` where `MMM` = isotope mass (3089… = 89Y, 3141… = 141Pr, 3162… = 162Dy), `nnn` = serial, `X` = format (`B` 100 tests, `C` 25 tests, `A` 50 tests, `D` IMC 25 µg, `G` rare). Same TDS document shared across B/C sizes → one *product* with several SKUs.
- OnDemand: `9[1-2][H|J]nnnMMM` where the trailing `MMM` is the isotope mass (91H009145 = CD45 D9M8I on 145Nd). `91H` = IMC, `92J` = suspension. Target strings are `Anti-CD45` with no species; species comes from Reported Reactivity.

ETL rules:
1. Strip HTML; parse TDS/SDS href and label.
2. `species_prefix` from `Anti-(Human|Mouse|Rat)`; canonical `target` = remainder, whitespace-collapsed; `reactivity[]` from splitting Reported Reactivity on commas, with alias map (Cynomolgus ↔ Cynomolgus Macaque, Rhesus ↔ Rhesus Macaque, "Monkey", "Cross", "All species").
3. Group SKUs into **products** keyed by (target, clone, metal, application); SKUs differ only by format.
4. Group products into **conjugate options** per (target, clone, application): this is the set the optimizer chooses among.
5. Map target → gene symbol(s) / UniProt (needed for abundance joins and synonyms: CD274 = PD-L1, CD279 = PD-1, CD3ε ≠ CD3). Curated alias table + HGNC lookup; ~500 rows, one afternoon.
6. Nightly re-fetch of the CSV (URL changes per upload; scrape the landing page for the current `wp-content/uploads/.../*.csv` link, or ask marketing for a stable URL / wpDataTables JSON endpoint). Diff → discontinued/new SKU events.

Post-close, replace with a direct feed from the ERP/Salesforce product catalogue; keep the CSV path as fallback.

### 3.2 Percent-overlap matrices (captured 2026-08-24)
`data/pdv2-api/api_spillover_{1..7}.txt` are the live tag × channel percent-overlap matrices the tool serves for each instrument ID (1 Helios, 2 CyTOF, 3 CyTOF2, 4 CyTOF XT, 5 Hyperion, 6 Hyperion+, 7 Hyperion XTi). Shape: `{donor_mass: {instrument, tag_id, recipient_mass: pct|null, ...}}`; 60–68 donor rows (89, Cd 102–116, Helios/XT include 122–131 Sb/Te/Xe, La 138 → Yb 176, Pt 193–198, Bi 209), ~300 non-zero off-diagonal cells each. Hyperion 5/6/7 share one matrix; Helios (1) and XT (4) are identical to each other; CyTOF (2) and CyTOF2 (3) are the older, larger-overlap sets. Values look hand-entered to 1 dp on the old instruments and to 9 dp (computed) on XTi. These are sufficient to reimplement Optimize Metals on day one; re-validate with R&D post-close and add lot-specific purity later.

`data/pdv2-api/api_massbias_1.txt` is the relative channel sensitivity curve for IMC (`panel_type` 1): 0.3 at 89/115/141, rising 0.4 → 0.9 across 142–158, 1.0 for 159–169, falling to 0.8 by 173–176, 0.7 for 193–198 and 209. `api_massbias_0.txt` is the suspension curve (`panel_type` 0), defined for every mass 89–209: 0.3 for everything ≤ 141 (including all Cd), the same lanthanide ramp, 0.8 from 173 to 192, 0.7 for 193–209. Both are coarse (one decimal) and identical in the lanthanide range; treat as a starting point and replace with instrument-measured curves post-close.

### 3.3 Signal / tolerance priors (corrected after the suspension capture)
- **Suspension (CyTOF) catalogue products carry real titrated values.** `/product/get_labels_by_target` returns, per tag, a product object with `Signal_Di` and `Tolerance_Di` (75th-percentile dual counts on a named `cell` type, usually PBMC, with `stim`), `release_date`, `custom_avail`, `optimize_avail`, `size`, `cat_number`. Example, CD45 HI30: 141Pr 1093/219, 154Sm 1153/231, 156Gd 583/116, 89Y 195/49, Cd 106–116 480–727, Pt 194–198 ≈ 410–450. Suspension kit rows store the same numbers in `abundance_factor` (e.g. CD3 372, Ki-67 1000, pHistone H3 4915, IL-21 22). This *is* the production S/T of the 2014 guide and it is still live for suspension. Sample payloads: `data/pdv2-api/api_labels_CD45_susp.txt`.
- **IMC products are placeholders**: `Signal_Di` 100, `Tolerance_Di` 1, no cell/stim; the IMC UI collapses this to the Low/Medium/High (33/66/100) factor, and every IMC kit row is 66 except two at 33. `/product/get_signal_tolerance` returns a default 58/12 regardless of product; do not use that endpoint.
- **Harvest done (2026-08-24, authorised by Tom; Jennifer Frahm flagged this data as a priority).** `data/pdv2-api/pdv2-conjugate-signal-tolerance-2026-08-24.csv`: 902 conjugate rows (560 suspension products / 333 targets; 327 IMC products / 143 targets), one call per target metered at 1.2 s, zero failures. Every suspension product has a measured `signal_di`/`tolerance_di` (median signal 143 dual counts, IQR 58–374, 95th pct 1303) with the titration context: `cell` (PBMC 316, Jurkat 31, whole blood 12, HeLa, MCF7, U-87 MG…) and `stim` (none; PMA/Iono 5 h; PVO4 15 min; PHA 3 d). Every IMC product is the 100/1 placeholder. Columns also include pdv2 product id, cat number, clone, species, test species, category, size, custom/optimize availability, release date, TDS URL. Post-close, replace with a direct export of the pdv2 `products` table; until then this file is the S/T source of truth for suspension.
- **Prices are not in pdv2** (`price` 0.00/null). Pricing must come from the ERP/Salesforce feed (§9 item 6).
- For IMC the quality gap is real and easy to beat: a curated abundance prior per (target, sample type, species) with more than three levels already improves on the incumbent. For suspension, use the titrated values as the default and let users override with the abundance pill.
- Public proxies for targets lacking values: (a) Human Protein Atlas per-gene single-cell and immune-cell nTPM (`https://www.proteinatlas.org/<ENSG>.json`, `api/search_download.php`, verified working 2026-08-24); (b) CellMarker 2.0 / PanglaoDB for cell-type ↔ marker; (c) MDIPA and the published Maxpar panel kits: their metal assignments encode SBT's own abundance judgement (a marker SBT put on 141Pr is bright; one on 165Ho is dim). Treat kit assignments as labelled training data for the abundance classifier.
- Represent abundance as a 4-level ordinal per (target, sample type, species): `very_high` (CD45, HLA-DR, CD3), `high`, `medium`, `low` (chemokine receptors, cytokines, phospho-epitopes, transcription factors), with a numeric default S/T per level. Users override per row with a slider, not dual counts.

### 3.4 Functional modules (curated, v1 seed by us)
Hand-curated YAML, ~40 modules, each: name, description, application (suspension/IMC/both), species, sample types, ordered marker list with role (`required`, `recommended`, `optional`), and default abundance. Seeds:
- Lineage backbone (human PBMC): CD45, CD3, CD4, CD8a, CD19/CD20, CD14, CD16, CD56, CD11c, HLA-DR, CD123, CD66b (whole blood).
- T-cell differentiation: CD45RA, CD45RO, CCR7, CD27, CD28, CD127, CD25, CD57, CD95.
- T-cell activation/exhaustion: CD69, CD38, HLA-DR, PD-1, TIM-3, LAG-3, TIGIT, CTLA-4, ICOS, CD39, TOX, Ki-67.
- Treg: CD25, CD127, FoxP3, CTLA-4, Helios, CD39.
- NK: CD56, CD16, NKG2A, NKG2D, KIRs, CD57, granzyme B, perforin.
- Myeloid / TAM (IMC): CD68, CD163, CD206, CD11b, CD14, HLA-DR, CD86, iNOS, Arg1 (mouse), F4/80 (mouse), Ly-6G/Ly-6C (mouse).
- B / plasma: CD19, CD20, CD27, IgD, CD38, CD138, CD24.
- Cell cycle / proliferation / death: Ki-67, IdU, pH3, cleaved caspase-3, cleaved PARP.
- Signalling (phospho): pSTAT1/3/5, pS6, pERK1/2, pAKT, pNFκB, pp38, IκBα.
- Cytokines (intracellular): IFN-γ, TNF, IL-2, IL-4, IL-17A, IL-10, GM-CSF, granzyme B.
- Tumour/stroma structural (IMC): pan-cytokeratin, E-cadherin, EpCAM, vimentin, α-SMA, collagen I, fibronectin, CD31, podoplanin, β-catenin.
- Checkpoint / IO tissue: PD-L1, PD-1, B7-H3, IDO, HLA-ABC, β2M, Ki-67, CD8, FoxP3.
- Metabolism: GLUT1, CPT1A, HK2, CD98, ATP5A, CS.
- Mouse immune backbone; mouse IO tissue.
- Always-on scaffolding per application: DNA intercalator (Ir191/193), viability (cisplatin 194/195/198Pt or Rh103), barcoding (Pd102–110), EQ bead channels (140Ce, 151Eu, 153Eu, 165Ho, 175Lu: flag, not forbid), IMC: DNA Ir, no viability, optional ruthenium counterstain.

Modules are also the SEO pages. Later: derive modules from the internal validated-panel library and the literature corpus (the `ai-ideas` panel database).

### 3.4b SBT's own IMC kits (captured)
`/experiment/get_kits/{exp}` lists the kits available to a panel; for an IMC panel that is 26 kits, and `data/pdv2-api/api_kit_contents.json` has every kit's rows (target, clone, metal, product_id, abundance). They are exactly the "functional module" concept, already curated by SBT: Basic Immune (CD20 115In, CD45 152Sm, CD68 159Tb, CD3ε 170Er), Lymphoid, Myeloid, T-Cell Exhaustion (TIM-3, IDO, LAG-3, OX40, CTLA-4), Cell Functional State (Ki-67, FoxP3, PD-1, PD-L1, GzmB), Cell Signaling, Cell Metabolism, Epithelial/Mesenchymal, Stromal, Tissue Architecture, Immune Cell Expansion, a 31-marker Immuno-Oncology master panel, Neuro-Oncology bundle, NeuroPhenotyping, and seven neuro-disease modules (AD, PD, MS, GBM, SynTau, Proteinopathies, Neuro Expansion), plus the Cell-Segmentation kit (Pt 195/196/198). `product_id` = store part number without the format suffix (3148020 ↔ 3148020D), which joins the kits to the catalogue CSV. Suspension kits (MDIPA, expansion panels, mouse kits) need one more capture from a suspension panel.

**Suspension kits (captured from panel 216733, CyTOF XT, Human): 36 kits** in `data/pdv2-api/api_kit_contents_susp.json`, with per-row titrated signal values. Highlights: Maxpar Direct Immune Profiling Assay (current 30-marker and legacy), five MDIPA expansion panels (Basic Activation, T Cell Expansion 2/3, Myeloid/B Cell Expansion 1/2), TBMNK+G (9), Broad Immune Profiling (20), T cell Profiling (10), Immune Checkpoint Core (9) + Expansion 1/2, Cytokine Core/Expansion/Cytotoxic Mediators, T cell Immune Checkpoint & Cytokine (40), Broad Immune Checkpoint (34), T-Cell Basic/Complete/Expansion IO (24/34/8), Regulatory T (13), T Helper (15), Mono/Mac (15), AML (15), B Cell (12), HSPC, PB Basic/Basic II/Phenotyping, ES/iPS, Cell Cycle, Signaling I, Cytokine I. Some MDIPA rows are tagged `(Kit Only)` (CD19, CD45RA) and the legacy MDIPA has rows with tag `any`; the segmentation/cytokine kits use Cd 106–116 and Pt 195–198 channels, which is how SBT itself uses the low-sensitivity ranges for bright cytokines and mediators.

Design consequence: v1 modules = these 62 SBT kits (26 IMC + 36 suspension, with SBT's metal assignments as the default "kit-locked" option) + our curated additions for mouse and for IMC gaps.

### 3.5 Recommendations ("people who chose X also chose Y")
v1: co-occurrence over (a) modules, (b) SBT panel kits (the 26 IMC kits above, MDIPA + 9 expansion panels, Human Broad Immune Profiling, TBMNK+G, OnDemand mouse kits), (c) a hand-entered set of ~50 published CyTOF/IMC panels. v2: co-occurrence over saved user panels, weighted by quotes converted.

### 3.6 Instrument channel definitions
Static table per instrument: usable mass range, reserved channels (intercalator, viability, barcodes, beads), relative sensitivity curve (digitised from guide Figure 1 or supplied by R&D), oxide propensity per element.

---

## 4. Domain model

```
Instrument(id, name, modality: suspension|imaging, mass_range, sensitivity_curve[mass→rel], po_matrix_id, reserved_channels[])
Channel(instrument_id, mass, element, isotope_label "162Dy", rel_sensitivity, reserved_for?)
Target(id, canonical_name, gene_symbols[], uniprot[], aliases[], category)     # CD8a, PD-1
Clone(id, target_id, clone_name, host, isotype, reactivity[species], applications[])
Conjugate(id, clone_id, metal "162Dy", application, assay_type: maxpar|ondemand|custom, signal_default, tolerance_default, status: active|discontinued)
SKU(id, conjugate_id, part_number, format, tds_url, sds_url, list_price?, lead_time_days)
AbundancePrior(target_id, species, sample_type, level, source, confidence)
Module(id, slug, name, application, species[], sample_types[], markers[{target_id, role, abundance_hint}])
Panel(id, owner?, name, instrument_id, species, sample_type, created, updated, share_token, parent_panel_id?)
PanelRow(panel_id, target_id, clone_id?, conjugate_id? | custom_metal?, lock: bool, signal, tolerance, group_ids[], source: module|search|suggestion|kit|import)
Group(panel_id, name, row_ids[])
PanelKit(id, part_number, name, rows[{conjugate_id}])
Quote(id, panel_id, contact, lines[{sku_id | service_code, qty}], status)
```

Optimizer output per panel: assignment `row → channel`, per-channel received SO, SO/T ratio, warnings[].

---

## 5. Optimization engine

### 5.1 Inputs
Rows (targets with allowed conjugate set or "custom on any free kit metal"), locks, groups, instrument PO matrix, sensitivity curve, reserved channels, abundance-derived S/T, user priority (which markers are "critical", i.e. dim and important).

### 5.2 Constraints (hard)
- One channel per row, one row per channel; channel ∈ instrument usable set minus reserved.
- Locked rows keep their channel.
- Catalogue rows may only take metals that exist as active conjugates for their clone (catalogue-first policy); an `allow_custom` flag per row relaxes this to any labelling-kit metal (custom conjugation service or Maxpar X8/MCP9 kit).
- Same clone cannot appear twice; same target twice only if user confirms (e.g. two CD45 for barcoding).
- IMC: exclude suspension-only conjugates and vice versa; sample type FFPE vs frozen filters IMC conjugates.

### 5.3 Objective
Minimize `Σ_channels received_SO(c) / T(c)` (pdv2's objective), plus soft terms:
- `w_sens × Σ_rows (1 − rel_sensitivity(channel)) × dimness(row)`: push dim/critical targets into 153–176.
- `w_oxide`: penalty when a bright target sits at M and a dim target at M+16 (already in PO, but weight it up for La/Ce/Pr/Nd donors).
- `w_adjacent`: penalty for bright next to dim at M±1 on the same cells (already in PO, kept as a separate tunable).
- `w_ondemand`, `w_custom`: prefer in-stock Maxpar > OnDemand > custom, tie-break by cost/lead time.
- `w_kit`: bonus for using an intact panel kit's assignment (kit price < sum of parts).
- Group exclusivity zeroes pairwise SO between rows in disjoint groups (pdv2 rule).

### 5.4 Algorithm
Assignment with pairwise terms is a quadratic assignment problem; at 30–45 rows × ~50 channels with heavily restricted per-row domains it is small. Implement as:
1. Greedy seed: sort rows by tolerance ascending (dimmest first), give each the highest-sensitivity, lowest-received-SO free channel from its domain.
2. Improve with simulated annealing / tabu over swap and relocate moves (evaluate ΔSO incrementally; 10k iterations is milliseconds).
3. Optionally exact: OR-Tools CP-SAT with linearised pairwise terms for a "final polish" button; keep out of the interactive path.
Run on every edit in a web worker (TS) so the public tool has no backend dependency for the core loop.

### 5.5 Explanations (this is what users actually want)
Every assignment carries reasons: "CD8a → 162Dy: catalogue conjugate, mid-mass high-sensitivity channel, no bright neighbours at 161/163/178 (M+16)". Every warning is actionable: "CCR7 (dim) receives 38% of tolerance from CD45-141Pr oxide; swap CD45 to 89Y (catalogue) to fix" with a one-click apply.

### 5.6 Validation
- Re-run MDIPA and the expansion panels through the engine with all rows unlocked: it should reproduce or beat the kit's SO/T score; report any row it wants to move and why.
- Re-run the ~50 published panels; compare score before/after.
- Unit tests on the PO math against the guide's formulas.

---

## 6. User experience

### 6.0 Design principles (read these before designing anything)
1. **A first-time user never sees a metal symbol until the panel is already balanced.** Metals are the tool's output, not its input. The incumbent makes the tag dropdown the third field on every row; we make it a chip that appears after Balance, editable only via a lock/swap affordance.
2. **Biology first, vendor vocabulary last.** Ask species, sample, instrument, and "what do you want to see." Never ask for a channel range, a catalogue ID, `(FDM)`, or a product number. Those exist in the BOM and nowhere else.
3. **Modules are the primary action; search is secondary; the product table does not exist.** The 26 SBT kits and our curated modules are the front door. Free-text search is for the marker you don't see. There is no 35-page product grid anywhere in the UI.
4. **Defaults that are defensible, revealed only when there is a real choice.** One clone per target per species/application is chosen for the user (most conjugate options, then FFPE-validated, then newest). Show a clone selector only when two or more clones are viable and differ in something the user would care about (reactivity, sample type).
5. **Every warning is a sentence with a button.** "CCR7 is dim and sits next to bright CD45. Move CD45 to 89Y" beats a 0.00 grid. No heat map without a legend, no colour without words.
6. **Always answer "am I done?"** Persistent status: channels used, modules covered, unresolved warnings, estimated cost, and what a similar panel usually adds.
7. **Shareable without an account, orderable with an email.** Every state is a URL. Login is asked for once, at the moment it buys the user something (save, quote, team).
8. **Expert path stays one click away.** FAS and power users get a table view with every field editable, bulk paste, lock-all, custom metals, and CSV import of pdv2 panels. Beginners never see it unless they open it.
9. **Explain the physics once, in place.** A single collapsible "why metals matter" panel with the sensitivity curve and oxide rule, linked from every warning. Not a PDF.
10. **Never dead-end.** No catalogue conjugate for a target → offer OnDemand, custom conjugation, or a near-synonym, inline, with lead time. Never a bare "not found."

### 6.1 Flow (four steps, all on one page with a persistent panel sidebar)
1. **Setup** (30 s): Application (CyTOF suspension / IMC tissue) → Species (human, mouse, NHP, other) → Sample type (PBMC, whole blood, dissociated tumour, bone marrow / FFPE, frozen) → Instrument (Helios, CyTOF XT, Hyperion XTi; default by application) → Barcoding? Viability? (adds scaffolding channels). Everything defaults; the user can start at step 2.
2. **Build**: left column of *modules* as cards with marker chips (click to add all required + recommended, hover to see clones and metal availability), a search box with synonyms (typing "PD-L1" finds CD274), and a *Suggested next* strip driven by §3.5. Each added marker shows its abundance level (editable pill: dim / medium / bright / very bright) and clone selection *only when >1 clone exists* (default = the clone with the most conjugate options for the species/application). A marker with no catalogue conjugate shows "custom conjugation" with the service option inline. Counter: "34 of 42 channels used".
3. **Balance**: runs continuously; the sidebar rows show metal chips; a horizontal *mass strip* (89 → 209, channel tiles coloured by SO/T, height by sensitivity) replaces the wheel; a compact overlap heat map available in a drawer. Lock icon per row. "Fix" chips on warnings. Groups UI: drag markers onto named populations ("CD4 T", "B cells") or auto-suggest groups from module membership.
4. **Order / export**: BOM table with SKU, format (auto-picks 100-test when n_samples × tests justifies it), qty, OnDemand lead time, custom service lines, accessories checklist; buttons *Add all to store cart* (WooCommerce, or Salesforce quote API post-close), *Download CSV (instrument template)*, *Download PDF*, *Share link*. Email required here and only here.

### 6.2 Details that matter
- URL-encoded panel state so any panel is a shareable link without an account.
- "Start from" gallery: SBT kits, curated modules, FAS-published templates, public community panels.
- Keyboard-first search; paste a list of markers (from a paper's methods section) and get a panel.
- Clone provenance: TDS link, reactivity list, validated sample types, from the catalogue row.
- Mobile-usable read view (sales on a customer site).
- Accessibility and dark mode for free with the component library.

### 6.3 Internal/FAS mode (login)
Annotate panels, mark as "SBT validated", attach titration signal values (updates S/T for that account), duplicate to a customer, see quote status.

### 6.4 Beginner walkthrough (the acceptance scenario)
Persona: Priya, second-year PhD student in a cancer immunology lab. Has FFPE blocks from a colorectal cancer cohort, has never run IMC, the core facility has a Hyperion XTi and told her to "bring a panel." She knows she cares about CD8 T cells, Tregs, macrophages, PD-L1 and proliferation. Goal: a quote-ready 30-marker panel in five minutes without talking to anyone.

| Minute | She sees | She does | System does |
|---|---|---|---|
| 0:00 | Landing: "Design a panel" with three big choices: *Tissue imaging (IMC)* / *Suspension cells (CyTOF)*, species tiles, sample-type tiles. No login. | Imaging → Human → FFPE. Instrument defaults to Hyperion XTi; she ignores it. | Loads the IMC catalogue, XTi spillover matrix, IMC sensitivity curve; reserves DNA (191/193 Ir) and the segmentation kit channels (195/196/198 Pt) silently. |
| 0:30 | Build screen. Left: module cards with plain names and 1-line blurbs: *Tissue architecture*, *Basic immune*, *Lymphoid*, *Myeloid / macrophages*, *T-cell exhaustion*, *Functional state (Ki-67, FoxP3, PD-1, PD-L1, GzmB)*, *Epithelial / mesenchymal*, *Stromal*... Right: her panel, empty, with "0 of ~40 channels". | Clicks Tissue architecture, Basic immune, Lymphoid, Myeloid, Functional state, T-cell exhaustion. | Adds 27 markers with defaulted clones. Panel list shows marker names and an abundance pill (e.g. "CD45 · bright", "PD-1 · dim"). No metals visible yet. Status: "27 of ~40 channels · 6 modules". |
| 1:30 | "Suggested next" strip: *CD163 (you have CD68; distinguishes M2-like TAMs)*, *pan-cytokeratin (tumour mask)*, *CD31 (vessels)*, *Ki-67 already in*. | Adds CD163, pan-CK, CD31. Types "granzyme" in search; picks Granzyme B. | Search resolves synonyms; shows one line per target, not per SKU. |
| 2:30 | Big button: **Balance panel**. | Clicks. | Runs the optimizer in <1 s. Panel rows gain metal chips. A mass strip shows 31 filled tiles, green. Two warnings in words: "FoxP3 is dim; it is on 155Gd next to bright CD45 (152Sm). Swap CD45 to 89Y" [Apply]. "LAG-3 has no FFPE-validated catalogue conjugate on a free channel; use OnDemand 91H... (6-day lead)" [Accept] [Remove]. |
| 3:00 | She applies both. Status: "31 markers · 0 warnings · 9 channels free · est. $X". | Opens "Why 89Y for CD45?" | Sentence: "89Y is a low-sensitivity channel; CD45 is bright on every leukocyte so it can afford it, and moving it clears the 155 neighbourhood for FoxP3." |
| 3:30 | **Order** tab: BOM grouped as "Tissue Architecture kit (5 antibodies) $" + 26 individual vials + Cell-Segmentation kit + Ir intercalator, each with part number, size, lead time. | Enters n = 40 slides; picks "Add all to cart" and "Download panel CSV". | Sizes vials from n, asks for her email once, creates share link, posts cart, emits analytics: species, sample, modules, size. |
| 4:30 | Share link + "Send to your core facility" + "Book 20 min with an application scientist" (optional). | Sends the link to the core. | Core opens read-only view on a phone; can duplicate into their own account. |

Acceptance: a tester matching this persona completes the scenario unassisted, and the resulting panel's SO/T score is ≤ the score of the same 31 markers hand-assigned by an FAS.

### 6.5 What we explicitly refuse to carry over from pdv2
- Instrument and channel range as the first question.
- Per-row tag dropdown as an input.
- `(FDM)` / `(any)` / `*clone*` vocabulary.
- The product-number search grid.
- An all-zero overlap grid as the primary feedback surface.
- A donut wheel with truncated labels.
- Groups as an unexplained checkbox matrix (we auto-derive groups from modules and lineage knowledge; expose them under "Advanced").
- Quote as a PDF to email.
- Kits hidden behind "Import".

---

## 7. Architecture

- **Front end**: Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, Zustand for panel state, optimizer in a Web Worker. Static-export-able so it can be hosted on the marketing site's CDN.
- **Data build**: Python (`uv`) ETL: catalogue CSV → normalised Parquet/JSON bundles (targets, clones, conjugates, SKUs, modules, instrument tables). Output is a versioned static JSON (~1 MB) shipped with the front end; no API needed to design.
- **Backend (small)**: FastAPI or Next.js route handlers on Postgres for saved panels, share tokens, quotes, analytics events, admin for modules/priors. Auth: magic link.
- **Integrations**: store cart (WooCommerce REST if the store runs Woo; the theme loads `wdt.woo-commerce` assets, unconfirmed), else a quote POST to Salesforce Web-to-Lead/Case as the day-1 path; TDS links pass through to Salesforce content; GTM events.
- **Admin**: CSV re-import, module editor, PO matrix upload per instrument, S/T override table, discontinued-SKU review.
- **Hosting**: Vercel or a single container; nightly ETL as a GitHub Action.
- Licensing: all permissive; OR-Tools (Apache) only if the exact solver is added.

Repo layout proposal:
```
pd3/
  etl/            # python: fetch_catalog.py, normalize.py, build_bundle.py, tests
  data/           # curated yaml: modules/, aliases.yaml, abundance_priors.yaml, instruments/, po_matrices/
  engine/         # typescript: po-model.ts, optimizer.ts, explain.ts, tests (vitest)
  web/            # next.js app
  docs/           # this spec, ADRs, validation reports
```

---

## 8. Milestones

| Phase | Weeks | Deliverable |
|---|---|---|
| 0 Data | 1–2 | ETL of public CSV → bundle; alias table; instrument tables; abundance priors v0 from HPA + kit assignments; 15 seed modules |
| 1 Engine | 2–4 | PO model + optimizer + explanations in TS with tests; validation against MDIPA/kits with a *synthetic* PO matrix |
| 2 UI alpha | 4–7 | Setup → Build → Balance on static bundle; share links; CSV export |
| 3 Order | 7–9 | BOM, PDF, cart/quote integration, email capture, analytics |
| 4 Internal data | post-close | Real PO matrices, S/T dump from pdv2 DB, pricing, ERP feed, FAS mode; retire pdv2 with redirect |
| 5 Learn | +1 quarter | Co-occurrence recommendations from saved panels; titration upload; literature-derived modules |

Phases 0–3 need nothing from SBT and can run pre-close on public data with a clearly labelled "demo overlap model".

---

## 9. Open questions / asks

**For SBT (post-signing or via clean team)**
1. pdv2 database export: saved panels (anonymised counts are enough to seed recommendations), user count and activity (is anyone using it?), and R&D's provenance for the spillover matrices already captured (who computed the XTi one, from what lots). PO matrices and kit definitions are no longer an ask (§3.2, §3.4b).
2. Is the store on WooCommerce and is a cart API exposed? Otherwise Salesforce quote object spec.
3. Stable catalogue feed (the CSV URL is per-upload) including list price, stock status, OnDemand lead time.
4. Isotope purity certificates for current lots; X8 vs MCP9 kit metal lists; which channels the XT/XTi treat as reserved.
5. The internal validated-panel library and the MDIPA expansion panel definitions (for modules and validation).

**Decided by Tom, 2026-08-24**
6. **Pricing is shown publicly.** Rationale: graduate students do not buy from vendors where a price or quote is hard to get. The BOM shows list price per line and a total; prices come from the catalogue feed (currently absent from the public CSV: needs the ERP/Salesforce feed post-close, with a manual price table as the stop-gap).
7. **Domain: standardbiotools.com.** Modules become indexable pages under that domain; the tool is a first-party SBT product, not a new-co brand.
8. **v1 imports and exports the pdv2 CSV panel and catalogue formats** (see `data/pdv2-formats/`), so existing users and FAS templates migrate with zero effort and pdv2 can be retired with a redirect.
9. **E-commerce:** there is no public e-store today; one will be added once purchasing/ERP integration is mapped. Order path for v1 is therefore *quote request* (email + structured payload to sales/Salesforce, with prices shown); "Add to cart" ships when the store exists. Design the BOM as a structured order object so the switch is a new sink, not a rewrite.

---

## 9b. pdv2 file formats to support in v1 (decision 8)

**Panel export CSV** (`GET /experiment/export_panel_multiple/[ids]`, example in `data/pdv2-formats/panel-export-example-imc.csv`). One row per target; columns:
`label, target, reactivity, instrument_type, tol_include, created, channel_min, channel_max, kit_instrument_avail, imported_exp, kit_reactivity, panel_type, description, experiment_name, exp_kit_id, product_id, active, custom, signal_di, label_product_id, catalog_id, clone, updated_at, kit_id, group, catalog, tolerance_di`.
Notes: `label` is the tag (`156Gd`); `product_id` is the full part number with format letter here (`3156033D`), unlike the node API; `catalog` is `FDM` for the SBT catalogue; `group` is a letter; `panel_type` is `IMC` or `Flow` as text; `instrument_type` is the display name. Import must accept this file and also the same file with only `target, clone, label` filled (what users hand-edit).

**Catalogue import template** (`data/pdv2-formats/catalog-import-template.csv`): `catalog, target, species, clone, tag, signal_di, tolerance_di, product, cat_number, panel_type` with `panel_type` ∈ {Flow, Imaging} and `-` for unknown S/T. This is how labs describe in-house conjugates; support it as the "my conjugates" import.

**Quote request** (`screenshots/dlg_quote_checked.png`): Kits table (qty, size, product number, kit contents, "order individually" checkbox), Individual Targets (qty, size, product number, target, clone, tag, and three fulfilment radio columns: Pre-Conjugate / Labeling Kit / Conjugation Service with Biochemical Confirmation), Cell identification and Sample Prep Buffers accessory pickers, then a *Quote Request* button that generates a PDF. `export_quote_multiple` and `export_tags_multiple` currently return HTTP 500. Our order object should carry the same three fulfilment options per line plus accessories, and post to sales/Salesforce instead of producing a PDF.

## 10. Reviewing the live pdv2 UI (done 2026-08-24; how to repeat)

Edge 151 refuses `--remote-debugging-port` on the default profile, so use a dedicated one:
`& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --user-data-dir=$env:LOCALAPPDATA\EdgeDebugProfile https://pdv2.standardbio.com/login`
Log in, then run `tools/inspect-pdv2.mjs` (needs `npm i playwright-core`). It screenshots each page, logs XHR, and calls the data endpoints from page context with the CSRF token. `tools/inspect-pdv2-suspension.mjs` creates a CyTOF XT panel (`PD3 capture - suspension`, id 216733 in Tom's account) and pulls the suspension curve, kits and export formats. Everything listed in Appendix A is captured; the only optional remaining pull is the full per-conjugate S/T harvest described in §3.3.

---

## 11. Build notes: things to remember (collected while investigating)

**Catalogue data quirks**
- Target strings are inconsistent across the two product lines: Maxpar rows say `Anti-Human CD45`, OnDemand rows say `Anti-CD45` with species only in *Reported Reactivity*. Normalise to (target, species set) before anything else; keep the raw string for display/search.
- The same biological target appears under several spellings: `CD8a` / `CD8A`, `CD3` / `CD3ε` / `CD3 epsilon`, `CD274/PD-L1`, `Pan-Keratin` / `Pan-CytoKeratin`, `Alpha-Smooth Muscle Actin` / `aSMA/ACTA2`, `Collagen I` / `Collagen type I`. Build the alias table from day one and treat it as a first-class curated file; the kits (§3.4b) are a good seed because they already collide.
- Clone strings carry sample validation in brackets in pdv2 (`SP142 [FFPE,Frozen]`) but the store CSV has it in *Sample Type*. Store the validation list on the Conjugate, not the Clone.
- `Reported Reactivity` contains "Cross" and "All species" as pseudo-species. Map "Cross" to the species list on the clone's TDS when known, otherwise treat as human+mouse with a `low_confidence` flag.
- Some entries are not antibodies: `Anti-Biotin`, `Anti-FITC`, `Anti-PE` (secondary detection), `ICSK-1/2/3` (segmentation), intercalators, beads. Give them a `kind` field so they never appear as "markers" but do appear in the BOM and reserve channels.
- One TDS document covers both the 100-test (B) and 25-test (C) SKU; use TDS URL equality as a sanity check when grouping SKUs into products.
- The store CSV URL embeds the upload month and file name; it will change. Discover it from the landing page each run and alert on schema change (column count/order).
- pdv2's `product_id` is the part number with the format letter stripped; kits reference products, not SKUs.

**Physics/engine facts to encode as data, not code**
- Channel sensitivity curve (IMC) and spillover matrices are per instrument and will be revised; load from versioned files with a `source` and `captured_on`. Never hard-code an oxide rule.
- Reserved channels differ by modality: suspension = Ir 191/193 (DNA), Pt 194/195/198 or Rh 103 (viability), Pd 102–110 (barcoding), optional bead channels 140/151/153/165/175; IMC = Ir 191/193 plus Pt 195/196/198 if the segmentation kit is used, Bi 209 usable (aSMA sits there in an SBT kit).
- 89Y, 113/115In, 141Pr are the classic "bright marker" channels; Cd 106–116 exist on suspension instruments only and are a second-class range. Keep "range classes" as data so the UI can say "low-sensitivity channel" without listing masses.
- Abundance is context dependent (CD4 is bright on T cells and dim on monocytes; PD-L1 is dim unless IFN-driven). The prior needs (target, species, sample type) keys, plus an override, plus a note field, and the tolerance formula for inducible antigens from the guide.
- Suspension conjugates have titrated `Signal_Di`/`Tolerance_Di` on PBMC (§3.3); use them as the default. IMC conjugates have none (100/1 placeholders behind a Low/Medium/High factor); the tool's generic fallback is 58/12. Never let an IMC default masquerade as a measurement in the UI: label the source of every S/T value (titrated / curated prior / default).
- Groups (mutually exclusive populations) change the optimizer's answer materially; derive them from lineage knowledge (CD3 vs CD19 vs CD68 vs pan-CK) so the beginner benefits without knowing the feature exists.

**Validation targets**
- Reproduce SBT's kit metal assignments: for each of the 26 IMC kits, run all rows unlocked and compare SO/T to the kit's. Report where we differ and why; these become regression tests.
- Score the 31-marker Immuno-Oncology master panel; it is the most demanding public reference.
- Keep a "golden panels" folder with FAS-approved panels once available; the engine must not regress them.

**Product/commercial**
- Login-free design is non-negotiable for the funnel; analytics should fire on module clicks, not just on quote.
- Kit pricing beats sum-of-parts; the BOM should prefer intact kits and say why.
- OnDemand lead time (~6 business days) and custom conjugation (validated vs non-validated service) are order-path branches, not errors.
- IMC users think in slides and ROIs; suspension users think in tests and tubes. Vial sizing logic must know which.
- The 2014 guide still ships as the help doc; the new tool needs in-product help written from scratch.
- Tom's pdv2 account is `user_id` 7431 (first panel 2026-07-02); the SBT kit-owner account is 3692 (kits dated 2024-12). If IDs are sequential, that is ~7,400 registrations lifetime. Ask for the activity data before assuming anyone uses it.

**Engineering**
- Edge 151 ignores `--remote-debugging-port` on the default profile; use a separate `--user-data-dir`.
- pdv2 endpoints accept `X-CSRF-TOKEN` from the page meta and `application/x-www-form-urlencoded` bodies; several return `text/html` content type with JSON bodies. Only useful for one-off capture; do not build on them.
- `/product/get_labels_by_target` 500s without the exact form payload the page sends; not needed since the store CSV covers labels.
- Playwright `networkidle` never settles on pdv2 because of GA beacons; use `domcontentloaded` plus a fixed wait.

## Appendix A. Files in this folder
- `data/sbt-catalog-master-2026-07-29.csv`: public catalogue snapshot (1,821 rows).
- `data/maxpar-panel-designer-user-guide-100-9557.pdf`: pdv2 user guide (35 pp.), source of §1.1–1.2.
- `data/pdv2-api/api_spillover_{1..7}.txt`: percent-overlap matrices per instrument ID (§3.2).
- `data/pdv2-api/api_massbias_1.txt`, `api_massbias_0.txt`: IMC and suspension channel sensitivity curves.
- `data/pdv2-api/api_kits.txt`, `api_kit_contents.json`: 26 SBT IMC kits with rows; `api_kits_susp.txt`, `api_kit_contents_susp.json`: 36 suspension kits with titrated signal values (§3.4b).
- `data/pdv2-api/api_labels_CD45_susp.txt`, `api_labels_CD45_imc.txt`: full product payloads incl. `Signal_Di`/`Tolerance_Di` (§3.3).
- `data/pdv2-api/api_exp_nodes.txt`: node (panel row) schema example; `api_sigtol.txt`: the misleading 58/12 default.
- `data/pdv2-api/pdv2-product-table-2026-08-24.csv`: pdv2's own product table (933 rows) parsed from the Advanced Search grid; 266 store products are absent from it.
- `data/pdv2-api/pdv2-conjugate-signal-tolerance-2026-08-24.csv`: the harvested per-conjugate signal/tolerance table (§3.3).
- `data/pdv2-formats/`: panel export CSV example and catalogue import template (§9b).
- `tools/harvest-pdv2-signal-tolerance.mjs`, `tools/flatten_harvest.py`: the harvest and its flattener.
- `data/pdv2-api/network.log`: endpoints observed.
- `screenshots/`: My Panels, Create Panel modal, Panel Table, Quick Add, Advanced Search, Wheel, Groups, My Catalogs, Manage Metals.
- `tools/inspect-pdv2.mjs`: Playwright CDP script for §10.

## Appendix B. Sources
- https://pdv2.standardbio.com/ (Laravel/Vue landing, "DVS Sciences is now Standard BioTools")
- https://store.standardbio.com/ (WordPress, wpDataTables table 14, master CSV link)
- https://www.standardbio.com/resources/panel-design (links guide + Modular Panel Compatibility Guide LAB-00075-Rev-1)
- Aarhus CyTOF core panel-design guidance: https://biomed.au.dk/cytof/guidelines/panel-design
- Bern IMC platform: https://www.imc.unibe.ch/technologies/helios/panel_design/
- Human Protein Atlas JSON API (verified 2026-08-24)
- KB: `wiki/entities/maxpar.md`, `wiki/topics/product-platform/metal-tagged-antibodies.md`, `wiki/strategy/ai-ideas.md`
