# PD3 — Maxpar Panel Designer v3

A public, login-optional panel designer for CyTOF (suspension) and IMC (tissue) mass cytometry.
Describe species, sample, instrument and biology; get back a metal-balanced, orderable panel.

Full specification: [`docs/SPEC.md`](docs/SPEC.md).

## Layout

| Path | What |
|---|---|
| `data/` | Raw captures (`pdv2-api/`, catalogue CSV), curated YAML (`curated/`), built bundles (`build/`) |
| `etl/` | Python (`uv`) ETL: raw + curated → `data/build/*.json` |
| `engine/` | TypeScript optimisation engine (PO model, optimiser, explanations) + vitest |
| `web/` | Next.js app (static export; GitHub Pages for demo, Azure SWA for prod) |
| `docs/` | Spec, ADRs, validation reports |
| `tools/` | One-off capture scripts used to harvest pdv2 (not part of the build) |

## Build the data bundle

```
cd etl
uv run pd3-etl instruments      # spillover matrices + sensitivity curves + reserved channels
uv run pd3-etl catalog          # store CSV + pdv2 S/T harvest -> targets/clones/conjugates/SKUs
uv run pd3-etl modules          # 62 SBT kits + curated modules, resolved against the catalogue
uv run pytest
```
