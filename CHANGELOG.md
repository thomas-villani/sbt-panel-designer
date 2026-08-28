# Changelog

The version shown in the app footer is `web/package.json` → `version`; bump it here and there together.
Numbering starts at 3.0.0 because this is the third generation of the Maxpar Panel Designer (pdv2 is the current SBT tool).

## Unreleased

Audit round (`docs/review/audit-2026-08-27.md`): the Tier 1 bug list, fixed across the three areas.

### Engine and web (audit round)
- Engine: `extraMetals` (Cd opt-in) reach the channel universe; duplicate locks, duplicate row ids and `evaluate()` collisions are caught instead of silently collapsing; unknown modality / reserved role now error; `unreserve` clears the flag as well as the reservation.
- Web: worker crashes and timeouts settle the pending promise instead of hanging on "checking…"; Cancel no longer submits the save / accept-warning forms; warning cards keyed by warning, not by index; unreadable share links say so; stale link fields (instrument, species, sample, custom rows) validated and round-tripped; modality switch clears the previous modality's blocked and opt-in metals; save failures surface; BOM CSV download fixed; balance prose and the "resolves this" badge follow the 1×/2× thresholds; one panel-health headline.

### ETL
- `Application` / `Assay Type` classified from an explicit allow-list; an unrecognised label fails the build naming the value and part number instead of silently reclassifying 372 IMC SKUs.
- Alias lists get a total sort order, so `catalog.json` is byte-reproducible (case-only ties such as `FOXP3` / `Foxp3` no longer follow set iteration).
- Metal masses, kit abundance values and pdv2 JSON list fields are parsed defensively: failures land in `stats` with row context rather than crashing the build.
- `kit-overrides.yaml` keys must match the captured kit names exactly, and module ids must be unique across kits and curated YAML — both raise with the difference lists.
- Dated inputs resolved by glob (newest match) with `PD3_STORE_CSV` / `PD3_HARVEST_CSV` / `PD3_PDV2_PRODUCTS_CSV` overrides; the resolved names are recorded in `sources`.
- Bundle `version` is now computed: `YYYY-MM-DD.<8 hex of a sha256 over the inputs>` (instruments keeps its curated YAML version and appends the hash).
- `pubs` defaults to `data/biblionautica.sqlite` (`PD3_PUBS_DB` to point elsewhere, documented in the README) and closes its sqlite connection; instrument data checks raise `ValueError` with the file and donor instead of a bare `assert`.
- `print` → `logging` on stderr (`PD3_LOG_LEVEL`); the stats JSON summary stays on stdout. ETL tests exercise `build()` into a tmp path instead of asserting against the committed artefact (40 tests).

### CI and docs
- `ci.yml`: Python pinned to 3.12, `uv run --frozen`, the three ETL commands re-run and `data/build` diffed (ignoring the dated `version` line) so stale committed bundles fail, and `npm run validate:check` added to the engine job. `pages.yml` runs the web unit tests before building. `npm run data` includes `pubs`.
- Docs: corrected `SPEC.md` link, layout table, module counts (123 = 62 kits + 19 curated + 42 cell types) and test counts; `PD3_PUBS_DB` documented; ROADMAP points at `data/curated/modules/kit-overrides.yaml`.

## 3.0.0 — 2026-08-27

First numbered build, incorporating both VP feedback rounds (2026-08-26) and FAS feedback round 3 (2026-08-27).

### FAS round 3
- Metal pill in the panel list is a dropdown: open channels, swap with another marker, or a custom conjugation of your own.
- Open channels shown as chips on Balance; click a chip or an empty bar on the mass strip to keep a channel empty on purpose.
- Sort the panel by added order, name or metal; **New** button starts a fresh panel and clears the share link.
- Balance shows a spill table (marker · metal · spill in · spill out · status) with the detail on hover.
- SBT kits arrive pinned to their kit metals and count as one SKU on the Order page ("in kit").
- Spill thresholds recalibrated against SBT's own kits: worth checking from 100 % of tolerance, must fix from 200 %; spill between two markers of the same kit is filed "validated in kit".
- Viability options (natural Pt cisplatin, 195Pt, 198Pt, Rh103 intercalator) and Cell-ID 20-Plex Pd barcoding.
- "Tissue structure" marker sets for IMC (epithelium, vessels, matrix, nuclei, brain).
- Opt-in metals beyond the catalogue (Cd on IMC), flagged on Balance and Order.
- Wording: "Cell ID & controls", "marker set"; higher-contrast secondary text and tiles; version in the footer.

### VP rounds 1–2 (2026-08-26)
- Channel budget explained; live panel health from the first marker; triage-style Balance with guided fixes; free clone choice; conjugation-to-order warnings; browse-all marker table; ~10× shorter share links.

### Earlier (2026-08-24/25, unnumbered)
- ETL for instruments, catalogue, kits/modules and publications; spillover engine with explanations; Next.js UI with SBT branding, cell-type modules, saved panels, mobile layout, CI and GitHub Pages deploy.
