/** PD3 engine public API. Pure functions, no I/O: safe to run in a Web Worker. */
import { buildResult } from "./explain";
import { Model, NONE, channelUniverse } from "./po-model";
import { optimize } from "./optimizer";
import type { OptimizerOptions, Problem, Result } from "./types";

export * from "./types";
export * from "./prior";
export * from "./metals";
export * from "./problem";
export * from "./tuning";
export * from "./version";
export { Model, NONE, channelUniverse, dimness, mechanismOf, type DuplicateLock } from "./po-model";
export { greedy, augment, descend, anneal, optimize, mulberry32 } from "./optimizer";
export { buildResult, bestMoveFor, type ResultNotes } from "./explain";

/** Assign channels to every row of the problem and explain the result. */
export function balance(problem: Problem, opts: OptimizerOptions = {}): Result {
  const t0 = performance.now();
  const model = new Model(problem);
  const out = optimize(model, opts);
  return buildResult(model, out.assign, {
    greedyScore: out.greedyScore, iterations: out.iterations, restarts: out.restarts, ms: performance.now() - t0,
    converged: out.converged,
  });
}

/**
 * Score and explain a given assignment (e.g. a kit's own metal choice or a user's manual edit) without optimising.
 * Rows keep their locks/domains so warnings can still suggest single-move fixes.
 *
 * A row may only hold a channel it could have been placed on: one of its own domain masses, or the mass it is pinned
 * to. Anything else - and any second row asking for a channel already taken - is reported as `invalid_assignment`
 * and left unassigned rather than silently double-booked.
 */
export function evaluate(problem: Problem, assignment: Record<string, number | null | undefined>): Result {
  const t0 = performance.now();
  const universe = new Set(channelUniverse(problem));
  const invalidAssignment: Record<string, string> = {};
  // Rows the assignment says nothing about still hold their pinned channel.
  const taken = new Map<number, string>();
  for (const r of problem.rows) {
    if (assignment[r.id] == null && r.locked != null && !taken.has(r.locked)) taken.set(r.locked, r.label);
  }

  const rows = problem.rows.map((r) => {
    const m = assignment[r.id];
    if (m == null) return r;
    if (!r.domain.includes(m) && r.locked !== m) {
      invalidAssignment[r.id] = `${r.label}: ${m} is not one of its allowed channels, so it was left unassigned.`;
      return { ...r, locked: null };
    }
    const holder = taken.get(m);
    if (holder != null) {
      invalidAssignment[r.id] = `${r.label}: ${m} is already taken by ${holder}, so it was left unassigned.`;
      return { ...r, locked: null };
    }
    taken.set(m, r.label);
    // Off-universe masses (reserved, no conjugation metal) only exist as channels because a row is pinned there.
    if (!universe.has(m) || (r.locked != null && r.locked !== m)) return { ...r, locked: m };
    return r;
  });

  const model = new Model({ ...problem, rows });
  const assign = new Int32Array(model.n).fill(NONE);
  rows.forEach((r, i) => {
    const m = assignment[r.id];
    if (m != null && invalidAssignment[r.id] == null) assign[i] = model.massIndex.get(m)!;
    else if (model.locked[i] !== NONE) assign[i] = model.locked[i];
  });
  const score = model.totalCost(assign);
  return buildResult(
    model, assign,
    { greedyScore: score, iterations: 0, restarts: 0, ms: performance.now() - t0, converged: true },
    { invalidAssignment },
  );
}
