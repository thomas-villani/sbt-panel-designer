# PD3 — Maxpar Panel Designer v3

A public, login-optional panel designer for CyTOF (suspension) and IMC (tissue) mass cytometry.
Describe species, sample, instrument and biology; get back a metal-balanced, orderable panel.

Full specification: [`docs/SPEC.md`](docs/SPEC.md).

See [docs/TECHNICAL.md](docs/TECHNICAL.md) for the engineering reference (data pipeline, bundle formats, engine maths, validation).

## Layout

| Path | What |
|---|---|
| `data/` | Raw captures (`pdv2-api/`, catalogue CSV), curated YAML (`curated/`), built bundles (`build/`) |
| `etl/` | Python (`uv`) ETL: raw + curated → `data/build/*.json` |
| `engine/` | TypeScript optimisation engine (PO model, optimiser, explanations) + vitest |
| `web/` | Next.js app (static export; GitHub Pages for demo, Azure SWA for prod) |
| `docs/` | Spec, ADRs, validation reports |
| `tools/` | One-off capture scripts used to harvest pdv2 (not part of the build) |

## Tests

```
npm test            # etl (pytest) + engine (vitest) + web unit (vitest)
npm run e2e         # Playwright scenario tests against next dev (first: cd web && npx playwright install chromium)
npm run typecheck
```

## Build the data bundle

```
cd etl
uv run pd3-etl instruments      # spillover matrices + sensitivity curves + reserved channels
uv run pd3-etl catalog          # store CSV + pdv2 S/T harvest -> targets/clones/conjugates/SKUs
uv run pd3-etl modules          # 62 SBT kits + curated modules, resolved against the catalogue
uv run pytest
```

### Engine (TypeScript, `engine/`)

```
cd engine
npm install
npm test                        # vitest: PO math, group exclusivity, locks/reserved, matching, determinism, prior
npm run typecheck
npm run validate                # SPEC 5.6: re-run all SBT kits unlocked -> docs/review/kit-validation.md
```

Public API (`engine/src/index.ts`): `buildProblem(bundle, {instrumentId, rows, ...})` then `balance(problem)` or
`evaluate(problem, assignment)` returns a `Result` with per-row explanations, warnings and one-click fixes.
Pure functions, no I/O, so it runs unchanged in a Web Worker. Abundance prior v0 lives in `engine/src/prior.ts`.

### Web app (Next.js, `web/`)

```
cd web
npm install
npm run dev                     # http://localhost:3000 (copies data/build -> public/data first)
npm run build                   # static export to web/out (NEXT_PUBLIC_BASE_PATH=/<repo> for GitHub Pages)
```

Setup → Build → Balance → Order in one page; metals appear only after Balance; every state is a shareable URL.
`.github/workflows/pages.yml` deploys `web/out` to GitHub Pages on push (enable Pages → Source: GitHub Actions in the repo settings).
