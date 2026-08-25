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
| **Publications per antibody** — list of papers using the clone/conjugate, with DOI, year, sample type, application | 🟡 | Sources: SBT citation database if one exists; otherwise Europe PMC / PubMed full-text search on clone + "Maxpar" / "CyTOF" / "imaging mass cytometry", curated. Show a count badge ("12 papers") on the target and a drawer with the list. Also feeds *sample-validated* flags. |
| **Suspension staining examples** — histogram / biaxial plot per conjugate (from TDS) | ⚪ | TDS PDFs already linked; extracting the plot image gives the same UX as the IMC gallery for CyTOF users. |
| **Clone comparison** — when >1 clone: show epitope, isotype, validated sample types, images and citations side by side | ⚪ | Clone selector exists; this is its "why" panel. |
| **Lot / titration data upload** (SPEC non-goal for v1; FAS mode) | ⚪ | Users upload titration signal values → per-account S/T priors. |

## 2. Data quality

| Item | Status | Notes |
|---|---|---|
| **Real IMC signal/tolerance priors** | 🟡 | Currently every IMC row defaults to "medium". Needs internal titration/intensity data from SBT R&D (per conjugate on FFPE/frozen). See `SPEC.md` §3.3. |
| **Sensitivity-range classes from the real instrument** (XT vs XTi, Helios) | 🟡 | Verify usable-channel lists (196Pt is absent from the XTi curve — is that right?). Ask for per-lot isotope purity. |
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
| **Saved panels + accounts** (email-gated save/share, SPEC goal 5) | ⚪ | Requires backend; do with Azure move. |
| **Starting-point library** — SBT validated panels and MDIPA/expansion kits as one-click starts | 🟡 | Kits are captured (SPEC §3.4b); needs internal validated-panel library. |
| **"People who chose X also chose Y"** recommendations (SPEC §3.5) | 🟡 | Needs pdv2 saved-panel export (anonymised counts). |
| **Cell-type coverage check** — "your panel can't separate NK from CD8 T" from a lineage ontology | ⚪ | Explanation layer on top of modules. |
| **Custom conjugation flow** — metal availability per labelling kit (X8/MCP9), lead time, pricing | 🟡 | Needs kit metal lists (SPEC §9 ask 4). |
| **Multi-panel / shared backbone** — design a backbone once, derive tumour/immune sub-panels | ⚪ | |

## 4. Ordering and commercial

| Item | Status | Notes |
|---|---|---|
| **Prices in the BOM** (decision 6) | 🟡 | Manual price table stop-gap until the ERP/Salesforce feed. |
| **Quote request** — email + structured payload to sales/SFDC (decision 9) | 🟡 | Deferred until UI sign-off. The BOM is already a structured order object. |
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
| **Backend** (only when save/quote/FAS need it) — small API + Postgres; keep the engine client-side | ⚪ | |
| Accessibility pass (keyboard nav in search, ARIA on the mass strip, colour-blind safe palette for clean/watch/spillover) | ⚪ | |
| Mobile layout (sidebar as bottom sheet) | ⚪ | |
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
6. **New:** IMC image library per conjugate; citation database; IMC titration / intensity data; TDS recommended dilutions.
