import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { InstrumentBundle, InstrumentDef, PoMatrix, Problem, Row } from "../src/index";

const here = dirname(fileURLToPath(import.meta.url));
export const BUILD_DIR = resolve(here, "../../data/build");

export function loadBundle(): InstrumentBundle {
  return JSON.parse(readFileSync(resolve(BUILD_DIR, "instruments.json"), "utf8"));
}

export function loadModules(): { version: string; stats: Record<string, unknown>; modules: any[] } {
  return JSON.parse(readFileSync(resolve(BUILD_DIR, "modules.json"), "utf8"));
}

/** Tiny synthetic instrument for exact-arithmetic tests. `pct[donor][recipient]` in percent. */
export function syntheticProblem(
  masses: number[],
  pct: Record<number, Record<number, number>>,
  rows: Row[],
  extra: Partial<Problem> = {},
): Problem {
  const instrument: InstrumentDef = {
    id: "synth", name: "Synthetic", modality: "suspension", pdv2_id: 0, po_matrix: 0, sensitivity_curve: 0, current: true,
    channels: masses.map((mass) => ({
      mass, element: `E${mass}`, label: `${mass}E`, rel_sensitivity: mass >= 153 && mass <= 176 ? 1 : 0.3,
      usable: true, in_po_matrix: true, range_class: mass < 142 ? "bright_only" : mass <= 152 ? "mid" : mass <= 176 ? "sweet_spot" : "heavy",
    })),
  };
  const po: PoMatrix = { donors: masses, recipients: masses, anomalies: [], pct: {} };
  for (const [d, r] of Object.entries(pct)) po.pct[d] = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v]));
  return { instrument, po, rows, reserved: [], weights: { w_sens: 0, w_flagged: 0 }, ...extra };
}
