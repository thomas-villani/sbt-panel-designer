/** Turn an assignment into per-row explanations, warnings and one-click fixes. */
import { Model, NONE, mechanismOf } from "./po-model";
import type { Contribution, Fix, RangeClass, Result, RowResult, Warning } from "./types";

// Calibrated 2026-08-27 against SBT's own kits run on their kit metals: MDIPA peaks at 1.75 (CD16 148Nd oxide into
// TCRgd 164Dy), the Immuno-oncology master panel at 0.76, most kits below 0.5. A validated product must not read as
// broken, so "worth checking" starts where the spill equals the tolerance and "must fix" at twice it.
export const SPILL_WARN = 1.0; // received / T above this -> warning
export const SPILL_CRIT = 2.0; // -> critical
export const DIM_T = 10; // rows with tolerance below this are "dim"

const CLASS_TEXT: Record<RangeClass, string> = {
  bright_only: "low-sensitivity channel, suited to bright markers",
  mid: "mid-sensitivity channel",
  sweet_spot: "high-sensitivity channel (153-176)",
  heavy: "reduced-sensitivity heavy channel",
};

const MECH_TEXT = { oxide: "oxide M+16", adjacent: "M+-1 abundance sensitivity", isotope: "isotopic impurity", other: "spillover" };

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => (x >= 10 ? x.toFixed(0) : x.toFixed(1));

function occupancy(model: Model, assign: Int32Array): Int32Array {
  const occ = new Int32Array(model.m).fill(NONE);
  for (let i = 0; i < model.n; i++) if (assign[i] !== NONE) occ[assign[i]] = i;
  return occ;
}

function contributionsFor(model: Model, i: number, assign: Int32Array): { received: Contribution[]; given: Contribution[] } {
  const ci = assign[i];
  const received: Contribution[] = [];
  const given: Contribution[] = [];
  if (ci === NONE) return { received, given };
  for (let j = 0; j < model.n; j++) {
    const cj = assign[j];
    if (j === i || cj === NONE || cj === ci || !model.interact[i][j]) continue;
    const inF = model.rawFrac[cj][ci];
    if (inF > 0) {
      const so = model.S[j] * inF;
      received.push({
        rowId: model.rows[j].id, label: model.rows[j].label, mass: model.masses[cj], so,
        fraction: so / model.T[i], pct: inF * 100,
        mechanism: mechanismOf(model.masses[cj], model.masses[ci], model.elements[cj], model.elements[ci]),
      });
    }
    const outF = model.rawFrac[ci][cj];
    if (outF > 0) {
      const so = model.S[i] * outF;
      given.push({
        rowId: model.rows[j].id, label: model.rows[j].label, mass: model.masses[cj], so,
        fraction: so / model.T[j], pct: outF * 100,
        mechanism: mechanismOf(model.masses[ci], model.masses[cj], model.elements[ci], model.elements[cj]),
      });
    }
  }
  received.sort((a, b) => b.so - a.so);
  given.sort((a, b) => b.fraction - a.fraction);
  return { received, given };
}

/** Best single move (relocate or swap) involving row r that lowers the total score; null if none. */
export function bestMoveFor(model: Model, r: number, assign: Int32Array, occ = occupancy(model, assign)): Fix | null {
  if (model.locked[r] !== NONE || assign[r] === NONE) return null;
  let best: Fix | null = null;
  for (const c of model.domains[r]) {
    if (c === assign[r]) continue;
    const k = occ[c];
    let d: number;
    let swapWith: string | undefined;
    if (k === NONE) d = model.deltaRelocate(r, c, assign);
    else if (model.canSwap(r, k, assign)) {
      d = model.deltaSwap(r, k, assign);
      swapWith = model.rows[k].id;
    } else continue;
    if (d < -1e-9 && (!best || d < best.delta)) {
      const label = model.rows[r].label;
      best = {
        rowId: model.rows[r].id, to: model.masses[c], toChannel: model.labels[c], swapWith, delta: d,
        message: swapWith
          ? `Swap ${label} (${model.labels[assign[r]]}) with ${model.rows[k].label} (${model.labels[c]})`
          : `Move ${label} from ${model.labels[assign[r]]} to ${model.labels[c]}`,
      };
    }
  }
  return best;
}

export function buildResult(model: Model, assign: Int32Array, stats: Result["stats"]): Result {
  const occ = occupancy(model, assign);
  const rows: RowResult[] = [];
  const warnings: Warning[] = [];
  const unassigned: string[] = [];
  const assignment: Record<string, number> = {};

  for (let i = 0; i < model.n; i++) {
    const row = model.rows[i];
    const ci = assign[i];
    const locked = model.locked[i] !== NONE;
    if (ci === NONE) {
      unassigned.push(row.id);
      const dom = model.domains[i];
      const allowed = dom.length ? [...dom].map((c) => model.labels[c]).join(", ") : "none";
      warnings.push({
        severity: "critical", rowId: row.id, code: "unassigned",
        message: dom.length
          ? `${row.label}: no free channel. Its allowed channels (${allowed}) are all taken or reserved - unlock a neighbour or allow a custom conjugate.`
          : `${row.label}: no allowed channel on this instrument - allow a custom conjugate or choose another clone.`,
      });
      rows.push({
        rowId: row.id, label: row.label, mass: null, channel: null, locked, rel_sensitivity: null, range_class: null,
        received: 0, receivedOverT: 0, contributions: [], given: [], reasons: ["unassigned"],
      });
      continue;
    }
    assignment[row.id] = model.masses[ci];
    const { received, given } = contributionsFor(model, i, assign);
    const recTotal = received.reduce((s, c) => s + c.so, 0);
    const overT = recTotal / model.T[i];
    const cls = model.rangeClass[ci];
    const reasons: string[] = [];
    reasons.push(`${model.labels[ci]}: ${cls ? CLASS_TEXT[cls] : "channel"} (relative sensitivity ${model.relSens[ci]})`);
    if (locked) reasons.push("locked");
    else if (model.domains[i].length === 1) reasons.push("the only allowed channel for this row");
    else reasons.push(`chosen from ${model.domains[i].length} allowed channels`);
    if (received.length === 0) reasons.push("receives no spillover");
    else {
      const top = received[0];
      reasons.push(
        `receives ${pct(overT)} of its tolerance (${num(recTotal)} of ${num(model.T[i])} counts), mostly from ${top.label} at ${top.mass} (${MECH_TEXT[top.mechanism]}, ${top.pct.toFixed(1)}%)`,
      );
    }
    if (given.length && given[0].fraction >= 0.1) {
      const g = given[0];
      reasons.push(`spills ${pct(g.fraction)} of ${g.label}'s tolerance at ${g.mass} (${MECH_TEXT[g.mechanism]})`);
    }
    rows.push({
      rowId: row.id, label: row.label, mass: model.masses[ci], channel: model.labels[ci], locked,
      rel_sensitivity: model.relSens[ci], range_class: cls, received: recTotal, receivedOverT: overT,
      contributions: received, given, reasons,
    });

    // Warnings.
    if (model.reservedCh[ci]) {
      warnings.push({
        severity: "warning", rowId: row.id, code: "reserved_lock",
        message: `${row.label} is locked on ${model.labels[ci]}, a reserved or unusable channel on ${model.problem.instrument.name}.`,
      });
    }
    if (overT >= SPILL_WARN && received.length) {
      const top = received[0];
      const j = model.rows.findIndex((r) => r.id === top.rowId);
      const fixDonor = bestMoveFor(model, j, assign, occ);
      const fixSelf = bestMoveFor(model, i, assign, occ);
      const fix = [fixDonor, fixSelf].filter((f): f is Fix => !!f).sort((a, b) => a.delta - b.delta)[0];
      let hint = "";
      if (!fix) {
        const stuck = [j, i].filter((k) => model.locked[k] !== NONE).map((k) => model.rows[k].label);
        hint = stuck.length ? ` Unlock ${stuck.join(" or ")} to let the optimiser move it.` : " No single move improves this; consider allowing custom conjugates.";
      }
      warnings.push({
        severity: overT >= SPILL_CRIT ? "critical" : "warning", rowId: row.id, code: "spillover",
        message: `${row.label} (${model.labels[ci]}) receives ${pct(overT)} of its tolerance; ${num(top.so)} counts come from ${top.label} at ${top.mass} (${MECH_TEXT[top.mechanism]}).${hint}`,
        fix: fix ?? undefined,
      });
    }
    if (model.flaggedCh[ci]) {
      warnings.push({
        severity: "info", rowId: row.id, code: "flagged_channel",
        message: `${row.label} sits on ${model.labels[ci]}, an EQ bead channel - fine as long as beads are gated out before analysis.`,
      });
    }
    if (!locked && model.T[i] < DIM_T && cls === "bright_only") {
      const fix = bestMoveFor(model, i, assign, occ);
      warnings.push({
        severity: "warning", rowId: row.id, code: "dim_bright_channel",
        message: `${row.label} is a dim marker on a low-sensitivity channel (${model.labels[ci]}); expect weak separation.`,
        fix: fix ?? undefined,
      });
    }
  }

  const order = { critical: 0, warning: 1, info: 2 };
  warnings.sort((a, b) => order[a.severity] - order[b.severity]);
  const score = model.totalCost(assign);
  const objective = model.objective(assign);
  return { assignment, score, objective, softCost: score - objective, rows, warnings, unassigned, stats };
}
