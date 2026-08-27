# Changelog

The version shown in the app footer is `web/package.json` → `version`; bump it here and there together.
Numbering starts at 3.0.0 because this is the third generation of the Maxpar Panel Designer (pdv2 is the current SBT tool).

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
