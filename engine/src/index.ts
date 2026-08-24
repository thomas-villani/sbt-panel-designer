/** PD3 engine public API. Pure functions, no I/O: safe to run in a Web Worker. */
import { buildResult } from "./explain.js";
import { Model, NONE } from "./po-model.js";
import { optimize } from "./optimizer.js";
import type { OptimizerOptions, Problem, Result } from "./types.js";

export * from "./types.js";
export * from "./prior.js";
export * from "./metals.js";
export * from "./problem.js";
export { Model, NONE, dimness, mechanismOf } from "./po-model.js";
export { greedy, augment, descend, anneal, optimize, mulberry32 } from "./optimizer.js";
export { buildResult, bestMoveFor, SPILL_WARN, SPILL_CRIT } from "./explain.js";

/** Assign channels to every row of the problem and explain the result. */
export function balance(problem: Problem, opts: OptimizerOptions = {}): Result {
  const t0 = performance.now();
  const model = new Model(problem);
  const out = optimize(model, opts);
  return buildResult(model, out.assign, {
    greedyScore: out.greedyScore, iterations: out.iterations, restarts: out.restarts, ms: performance.now() - t0,
  });
}

/**
 * Score and explain a given assignment (e.g. a kit's own metal choice or a user's manual edit) without optimising.
 * Rows keep their locks/domains so warnings can still suggest single-move fixes.
 */
export function evaluate(problem: Problem, assignment: Record<string, number | null | undefined>): Result {
  const t0 = performance.now();
  const universe = new Set(new Model(problem).masses);
  const rows = problem.rows.map((r) => {
    const m = assignment[r.id];
    if (m == null) return r;
    if (!universe.has(m) || (r.locked != null && r.locked !== m)) return { ...r, locked: m };
    return r;
  });
  const model = new Model({ ...problem, rows });
  const assign = new Int32Array(model.n).fill(NONE);
  rows.forEach((r, i) => {
    const m = assignment[r.id];
    if (m != null) assign[i] = model.massIndex.get(m)!;
    else if (model.locked[i] !== NONE) assign[i] = model.locked[i];
  });
  const score = model.totalCost(assign);
  return buildResult(model, assign, { greedyScore: score, iterations: 0, restarts: 0, ms: performance.now() - t0 });
}
