/** Turn an assignment into per-row explanations, warnings and one-click fixes. */
import { Model, NONE, mechanismOf } from "./po-model";
import { DIM_T, GIVEN_MENTION, SPILL_CRIT, SPILL_WARN } from "./tuning";
import { ENGINE_VERSION } from "./version";
import type { BlockedChannel, Contribution, Fix, RangeClass, Result, RowResult, Warning } from "./types";

// Tuning lives in ./tuning.ts; re-exported here because these two are the public spill thresholds.
export { DIM_T, SPILL_CRIT, SPILL_WARN } from "./tuning";

const CLASS_TEXT: Record<RangeClass, string> = {
  bright_only: "low-sensitivity channel, suited to bright markers",
  mid: "mid-sensitivity channel",
  sweet_spot: "high-sensitivity channel (153-176)",
  heavy: "reduced-sensitivity heavy channel",
};

const MECH_TEXT = { oxide: "oxide M+16", adjacent: "M+-1 abundance sensitivity", isotope: "isotopic impurity", other: "spillover" };

const RESERVED_TEXT = {
  role: "a reserved channel",
  blocked: "a channel with no conjugation metal on this instrument",
  undetected: "a channel this instrument does not detect",
};

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

/** Every mass the row asked for and who holds it (null = reserved, not a channel, or simply free). */
function blockedByFor(model: Model, i: number, occ: Int32Array): BlockedChannel[] {
  return model.rows[i].domain.map((mass) => {
    const c = model.massIndex.get(mass);
    if (c == null || model.reservedCh[c]) return { mass, holderRowId: null };
    const holder = occ[c];
    return { mass, holderRowId: holder === NONE ? null : model.rows[holder].id };
  });
}

export interface ResultNotes {
  /**
   * Rows whose caller-supplied assignment was rejected (rowId -> why). They come back `unassigned` with an
   * `invalid_assignment` warning instead of the generic "no free channel" one.
   */
  invalidAssignment?: Record<string, string>;
}

export function buildResult(model: Model, assign: Int32Array, stats: Result["stats"], notes: ResultNotes = {}): Result {
  const occ = occupancy(model, assign);
  const rows: RowResult[] = [];
  const warnings: Warning[] = [];
  const unassigned: string[] = [];
  const assignment: Record<string, number> = {};

  // Two rows pinned to one mass: the first in panel order keeps it, the rest were unlocked by the model.
  for (const d of model.duplicateLocks) {
    const label = (id: string) => model.rows.find((r) => r.id === id)?.label ?? id;
    const channel = model.labels[model.massIndex.get(d.mass) ?? -1] ?? String(d.mass);
    warnings.push({
      severity: "critical", rowId: d.rowId, code: "duplicate_lock",
      message: `${label(d.rowId)} and ${label(d.keptBy)} are both pinned to ${channel}. ${label(d.keptBy)} keeps it; ${label(d.rowId)} was treated as unpinned - unpin one of them.`,
    });
    warnings.push({
      severity: "critical", rowId: d.keptBy, code: "duplicate_lock",
      message: `${label(d.keptBy)} keeps ${channel}; ${label(d.rowId)} is pinned to the same channel and had to be moved.`,
    });
  }

  for (let i = 0; i < model.n; i++) {
    const row = model.rows[i];
    const ci = assign[i];
    const locked = model.locked[i] !== NONE;
    if (ci === NONE) {
      unassigned.push(row.id);
      const dom = model.domains[i];
      const allowed = dom.length ? [...dom].map((c) => model.labels[c]).join(", ") : "none";
      const blockedBy = blockedByFor(model, i, occ);
      const invalid = notes.invalidAssignment?.[row.id];
      warnings.push(invalid
        ? { severity: "critical", rowId: row.id, code: "invalid_assignment", message: invalid, blockedBy }
        : {
          severity: "critical", rowId: row.id, code: "unassigned", blockedBy,
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
    if (given.length && given[0].fraction >= GIVEN_MENTION) {
      const g = given[0];
      reasons.push(`spills ${pct(g.fraction)} of ${g.label}'s tolerance at ${g.mass} (${MECH_TEXT[g.mechanism]})`);
    }
    rows.push({
      rowId: row.id, label: row.label, mass: model.masses[ci], channel: model.labels[ci], locked,
      rel_sensitivity: model.relSens[ci], range_class: cls, received: recTotal, receivedOverT: overT,
      contributions: received, given, reasons,
    });

    // Warnings. A channel the user opted into (extraMetals) is a normal channel here: reservedCh is 0 for it.
    const reason = model.reservedReason[ci];
    if (model.reservedCh[ci] && reason) {
      warnings.push({
        severity: "warning", rowId: row.id, code: "reserved_lock", reason,
        message: `${row.label} is locked on ${model.labels[ci]}, ${RESERVED_TEXT[reason]} on ${model.problem.instrument.name}.`,
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
  return {
    assignment, score, objective, softCost: score - objective, rows, warnings, unassigned,
    engineVersion: ENGINE_VERSION, stats,
  };
}
