# PD3 roadmap

Living list of what comes after the alpha. `SPEC.md` is the contract; `docs/TECHNICAL.md` §5 tracks phase status.
This page is the backlog: ideas, their rationale, and what each one needs before it can start.
Nothing here is committed or ordered by date — mark an item **now / next / later** when it's picked up.

Status legend: 🟢 in progress · 🟡 needs data or a decision · ⚪ idea

---

## 1. Antibody evidence (why should I trust this marker?)

| Item | Status | Notes |
|---|---|---|
| **IMC image gallery per antibody** — representative image(s) per conjugate/clone/tissue, shown in the search hit, module card and BOM row | 🟡 | Needs: SBT R&D / marketing image library (TIFF/PNG + tissue, sample type, clone, metal, dilution, Hyperion model). Store as static `public/img/<conjugate_id>/…` with a JSON manifest from ETL; lazy-load thumbnails. Licensing: SBT-owned images only, or publication images with permission. |
| **Publications per antibody** — list of papers using the clone/conjugate, with DOI, year, sample type, application | 🟢 v0 shipped | v0 (2026-08-25): `pd3-etl pubs` matches every catalogue target's name/aliases against the titles + abstracts of 5.4k CyTOF / IMC papers in Tom's `biblionautica.sqlite` (OpenAlex-derived; 312 of 384 targets get ≥1 hit, 1.3k papers). Shown as an "n papers" badge in search hits and a top-12 list (DOI links) in the row drawer. Abstract-level only, so it is *marker mentioned*, not *this clone used*. Next: full-text / supplementary-table matching on clone names, sample type and application; SBT citation DB if one exists; feed *sample-validated* flags. |
| **Suspension staining examples** — histogram / biaxial plot per conjugate (from TDS) | ⚪ | TDS PDFs already linked; extracting the plot image gives the same UX as the IMC gallery for CyTOF users. |
| **Clone comparison** — when >1 clone: show epitope, isotype, validated sample types, images and citations side by side | ⚪ | Clone selector exists; this is its "why" panel. |
| **Lot / titration data upload** (SPEC non-goal for v1; FAS mode) | ⚪ | Users upload titration signal values → per-account S/T priors. |

## 2. Data quality

| Item | Status | Notes |
|---|---|---|
| **Real IMC signal/tolerance priors** | 🟡 | Currently every IMC row defaults to "medium". Needs internal titration/intensity data from SBT R&D (per conjugate on FFPE/frozen). See `SPEC.md` §3.3. |
| **Sensitivity-range classes from the real instrument** (XT vs XTi, Helios) | 🟡 | Verify usable-channel lists. The IMC curve (pdv2 `panel_type=1`) holds 45 masses — 89Y, 115In, 141–176, 193Ir, 194–198Pt/Au, 209Bi — and omits **191Ir** (not 196Pt). That is where 41 vs 42 comes from: 45 − 3 segmentation kit − 193Ir, because the Ir intercalator occupies 191 *and* 193 and only 193 is a detection channel. The UI now shows this arithmetic (2026-08-26); confirm with SBT which number the FAS team should quote, and whether 113In belongs in the IMC curve. Ask for per-lot isotope purity. |
| **Abundance / expression level per target × sample type** | 🟡 | Today the level comes from the module seed or a titration; a proper table (Human Protein Atlas / CellMarker / internal) would set "dim/bright" automatically for FFPE vs PBMC. |
| **Stable catalogue feed** with price, stock, OnDemand lead time | 🟡 | SPEC §9 ask 3. The public CSV URL changes per upload. |
| **Catalogue review sheet loop** — the ETL emits review CSVs; turn FAS corrections into overrides checked into `data/overrides/` | ⚪ | |

## 3. Panel design features

| Item | Status | Notes |
|---|---|---|
| **pdv2 CSV import/export** (SPEC §9b, decision 8) | 🟡 next | Formats captured in `data/pdv2-formats/`. Import → rows + locks; export → pdv2-compatible panel CSV so FAS templates migrate. |
| **Exclusivity groups UI** ("Advanced": markers that never co-express can share tolerance) | ⚪ | Engine supports it; UI hidden. Seed groups from lineage in modules. |
| **Acquisition template export** — CyTOF XT/Helios channel template, Hyperion panel CSV (mass, label) | ⚪ | Cheap win for users; complements the BOM. |
| **Panel diff / versioning** — compare two share links; "what changed and why the score moved" | ⚪ | State is already in the URL; a diff view is mostly UI. |
| **Saved panels + accounts** (email-gated save/share, SPEC goal 5) | 🟢 v0 shipped / 🟡 backend | v0 (2026-08-25): named saves and an auto-draft in `localStorage` (`web/lib/saved.ts`); a plain reload picks the draft up with a "Keep it / Start fresh" bar. Permanent saves need login + a store: leaning **SQLite** (single file, trivially backed up, fits a small Azure App Service) behind a tiny API; migrate the localStorage list on first login and port pdv2 users' saved panels (needs the pdv2 export, §8 ask 1). |
| **Starting-point library** — SBT validated panels and MDIPA/expansion kits as one-click starts | 🟡 | Kits are captured (SPEC §3.4b); needs internal validated-panel library. |
| **"People who chose X also chose Y"** recommendations (SPEC §3.5) | 🟡 | Needs pdv2 saved-panel export (anonymised counts). |
| **Cell-type modules** — 1-4 markers per immune / tissue cell type, with lineage negatives, searchable from the marker box ("dendritic" → HLA-DR, CD11c, CD123 + CD3−, CD19−, CD14−, CD56−) | 🟢 shipped | 42 modules in `data/curated/modules/cell-types.yaml` (29 human - 17 usable on IMC - and 13 mouse; markers not sold for the current modality are skipped or, if required, added as custom conjugations; search shows "suspension only" hits instead of dead-ending) following the standard PBMC / whole-blood gating map (Teiko-style Lin = CD3/CD19/CD14/CD56). Negatives carry `polarity: neg` and render dashed. 2026-08-26: nothing is struck through any more - a card lists only what it will add, and a module whose own `definition` names a marker with no conjugate for the modality is hidden entirely rather than shown with a hole (IMC loses Dendritic cells, T-cell memory and Plasmablasts: no CD123, CCR7 or CD138 for tissue). Open question: `role: optional` markers are dropped silently even when they are sold (Podoplanin on Endothelial cells) although the definition still names them - either offer them as one-click extras on the card or take them out of the definition text. Next: subsets people ask for (Vδ2, cDC1/cDC2 once CD1c/XCR1 are sold for human, M1/M2, exhausted vs senescent), NHP, and a "which cell types can this panel resolve?" reverse view. |
| **Cell-type coverage check** — "your panel can't separate NK from CD8 T" from a lineage ontology | ⚪ | Explanation layer on top of the cell-type modules' definitions (the gating shorthand is already structured enough to evaluate). |
| **"Panel not possible" guidance** — when the optimiser cannot place every marker, say *why* and what to do (custom conjugation, drop a low-value marker, switch instrument, split the panel) | 🟡 | Engine reports `unassigned`; the UI needs a proper explanation + suggested actions rather than a red pill. |
| **"View all" marker table** — a sortable table of every catalogue marker for the setup (clone, metals, papers, validated), as an alternative to search | 🟢 shipped | v0 (2026-08-26): `web/components/BrowseAll.tsx`, opened from a link under the search box ("Browse all 133 markers available for IMC"). Columns: marker + aliases, clones, metals + TDS, papers, which panels it is in (clickable), add/remove; filters for *in a panel* / *not yet added*, sort by name, papers, clones or panels. Next: SKU and gene-symbol search keys (row below), and images once §1 lands. |
| **Enter by catalogue number / other identifiers** — paste part numbers (3148020D), clone names, UniProt / gene symbols | ⚪ | Search keys today: target name + aliases. Add SKU, clone and gene-symbol keys to the index. |
| **Custom conjugation flow** — metal availability per labelling kit (X8/MCP9), lead time, pricing | 🟡 | Needs kit metal lists (SPEC §9 ask 4). Shipped 2026-08-26: the Balance step now warns whenever a row would need conjugating to order (`web/lib/conjugation.ts`) instead of letting it surface only in the BOM, offers a free catalogue channel when the clone is sold on one, and the panel row shows a starred channel (`89Y*`). Custom rows can also take a metal the user already has ("already labelled with 168Er"), which the balancer then designs around. |
| **Multi-panel / shared backbone** — design a backbone once, derive tumour/immune sub-panels | ⚪ | |
| **Blank / reserved channels** — keep channels empty for a nuclide the designer does not model (RPT with Lu-177) | 🟢 shipped | v0 (2026-08-26): a channel picker in Setup writes `setup.blocked`, which goes to the engine as `extraReserved`, comes off the channel budget and renders hatched in the mass strip. Next: named presets ("Lu-177 RPT", "Ac-225") once we know which channels each therapy actually disturbs, rather than making the user pick masses by hand. |
| **Topic search** — "io", "neuro", "TME", "MDIPA" find the panels for a subject area, not just marker names | 🟢 shipped | v0 (2026-08-26): ~60 curated modules carry topic aliases in `data/curated/modules/*.yaml` (both spellings: tumour/tumor, signalling/signaling, leukaemia/leukemia). Queries of 2 characters are allowed but must match a whole alias, so "IO" cannot match neurodegeneratIOn. A "show all N panels matching X as cards" link filters the module grid. Next: alias coverage for the remaining SBT kits, and synonyms from the papers DB. |

## 4. Ordering and commercial

| Item | Status | Notes |
|---|---|---|
| **Prices in the BOM** (decision 6) | 🟡 | Manual price table stop-gap until the ERP/Salesforce feed. |
| **Quote request** — email + structured payload to sales/SFDC (decision 9) | 🟡 | Deferred until UI sign-off. The BOM is already a structured order object. Must keep kits whole: a panel started from MDIPA has to reach the quote as the MDIPA SKU, not 30 vials. |
| **Add to cart** when the e-store exists | ⚪ | New sink on the same order object. |
| **Distributor / region awareness** — part numbers and currency by region | ⚪ | |
| **Imaging vial sizing** — replace the "~50 slides per 25 µg" assumption with real dilution guidance | 🟡 | Needs TDS recommended dilutions per conjugate. |

## 5. Internal / FAS mode (SPEC §6.3)

| Item | Status | Notes |
|---|---|---|
| Login (SBT SSO), annotate a panel, mark "SBT validated", duplicate to a customer | ⚪ | |
| Attach titration values → account-level priors | ⚪ | |
| See quote status; hand-off notes | ⚪ | |
| Usage analytics: species/sample/instrument/themes captured on share/quote (SPEC goal 5) | ⚪ | Privacy review first. |

## 6. Content and SEO (SPEC goal 4)

| Item | Status | Notes |
|---|---|---|
| **Module landing pages** — `/panels/t-cell-exhaustion-human-ffpe` pre-built, indexable, ends in the designer | ⚪ | Static export already; generate one route per module × species × sample. |
| **Antibody pages** — one page per conjugate with images, citations, TDS, "add to panel" | ⚪ | Combines §1 items; the natural home for the image gallery. |
| Glossary / "Why metals matter" as standalone docs | ⚪ | Already a drawer in the Balance step. |

## 7. Platform and engineering

| Item | Status | Notes |
|---|---|---|
| **Azure production deploy** under standardbiotools.com (decision 7) | ⚪ | Static Web App or App Service; keep GitHub Pages as the staging demo. |
| **Backend** (only when save/quote/FAS need it) — small API + SQLite (Postgres later if needed); keep the engine client-side | ⚪ | SQLite first: one file, easy backup/restore, enough for saved panels + quotes at this scale. |
| Accessibility pass (keyboard nav in search, ARIA on the mass strip, colour-blind safe palette for clean/watch/spillover) | ⚪ | |
| Mobile layout (sidebar as bottom sheet) | 🟢 shipped | 2026-08-25: below `lg` the panel is a fixed bottom bar (count, status, next-step button) that expands into a sheet; header collapses to numbered steps; mass strip and BOM scroll inside their own boxes; taller touch targets. Guarded by the `mobile` Playwright project (iPhone 13 size). Next: swipe-to-dismiss, PWA manifest / add-to-home-screen, test on real iOS Safari. |
| Internationalisation (at least units/currency) | ⚪ | |
| Shorter share URLs (server-side short links once a backend exists; ~2.9k chars today) | ⚪ | |
| Engine: multi-start / time-budgeted optimiser for 60+ marker panels; Web Worker progress | ⚪ | Already fast (<50 ms), so low priority. |
| Nightly ETL run in CI with a diff report when SBT's catalogue changes | ⚪ | |
| Telemetry for balance quality (score distribution, fix-apply rate) | ⚪ | |

## 8. Asks outstanding to SBT (mirror of SPEC §9)

1. pdv2 saved-panel export (anonymised) and usage numbers.
2. Store / cart API or Salesforce quote object spec.
3. Stable catalogue feed with price, stock, lead time.
4. Isotope purity, X8/MCP9 metal lists, reserved channels per instrument.
5. Validated-panel library and MDIPA expansion definitions.
6. **New:** IMC image library per conjugate; citation database (we have an abstract-level literature DB already, see §1); IMC titration / intensity data; TDS recommended dilutions.
