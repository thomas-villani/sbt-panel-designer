/** Greedy seed (dimmest first) + augmenting-path repair + simulated annealing + local descent. */
import { Model, NONE } from "./po-model";
import type { OptimizerOptions } from "./types";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function occupancy(model: Model, assign: Int32Array): Int32Array {
  const occ = new Int32Array(model.m).fill(NONE);
  for (let i = 0; i < model.n; i++) if (assign[i] !== NONE) occ[assign[i]] = i;
  return occ;
}

/** Greedy: locked rows first, then tiny domains, then dimmest first; each takes its cheapest free channel. */
export function greedy(model: Model): Int32Array {
  const assign = new Int32Array(model.n).fill(NONE);
  const occ = new Int32Array(model.m).fill(NONE);
  for (let i = 0; i < model.n; i++) {
    if (model.locked[i] !== NONE) {
      assign[i] = model.locked[i];
      occ[model.locked[i]] = i;
    }
  }
  const order = model.movable.slice().sort((a, b) => {
    const da = model.domains[a].length <= 2 ? 0 : 1;
    const db = model.domains[b].length <= 2 ? 0 : 1;
    if (da !== db) return da - db;
    if (model.T[a] !== model.T[b]) return model.T[a] - model.T[b];
    return a - b;
  });
  for (const i of order) {
    let best = NONE;
    let bestCost = Infinity;
    for (const c of model.domains[i]) {
      if (occ[c] !== NONE) continue;
      const cost = model.rowCost(i, c, assign);
      if (cost < bestCost) {
        bestCost = cost;
        best = c;
      }
    }
    if (best !== NONE) {
      assign[i] = best;
      occ[best] = i;
    }
  }
  augment(model, assign);
  return assign;
}

/** Kuhn augmenting paths: give every unassigned movable row a channel whenever a feasible matching exists. */
export function augment(model: Model, assign: Int32Array): void {
  const occ = occupancy(model, assign);
  const tryRow = (i: number, seen: Uint8Array): boolean => {
    for (const c of model.domains[i]) {
      if (seen[c]) continue;
      seen[c] = 1;
      const j = occ[c];
      if (j === NONE || (model.locked[j] === NONE && tryRow(j, seen))) {
        assign[i] = c;
        occ[c] = i;
        return true;
      }
    }
    return false;
  };
  for (const i of model.movable) {
    if (assign[i] !== NONE) continue;
    tryRow(i, new Uint8Array(model.m));
  }
}

/** Best-improvement local search over relocate + swap moves until no move helps. Returns moves applied. */
export function descend(model: Model, assign: Int32Array, maxPasses = 500): number {
  let improved = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    const occ = occupancy(model, assign);
    let bestDelta = -1e-9;
    let bi = NONE;
    let bc = NONE;
    let bj = NONE;
    for (const i of model.movable) {
      if (assign[i] === NONE) continue;
      for (const c of model.domains[i]) {
        if (c === assign[i]) continue;
        const j = occ[c];
        let d: number;
        if (j === NONE) d = model.deltaRelocate(i, c, assign);
        else if (j > i && model.canSwap(i, j, assign)) d = model.deltaSwap(i, j, assign);
        else continue;
        if (d < bestDelta) {
          bestDelta = d;
          bi = i;
          bc = c;
          bj = j;
        }
      }
    }
    if (bi === NONE) break;
    if (bj === NONE) assign[bi] = bc;
    else {
      assign[bj] = assign[bi];
      assign[bi] = bc;
    }
    improved++;
  }
  return improved;
}

type Move = [i: number, c: number, j: number];

export function anneal(model: Model, start: Int32Array, iterations: number, rng: () => number): Int32Array {
  const assign = Int32Array.from(start);
  const movable = model.movable.filter((i) => assign[i] !== NONE && model.domains[i].length > 1);
  if (movable.length < 1) return assign;
  const occ = occupancy(model, assign);

  const propose = (): Move | null => {
    const i = movable[Math.floor(rng() * movable.length)];
    const dom = model.domains[i];
    const c = dom[Math.floor(rng() * dom.length)];
    if (c === assign[i]) return null;
    const j = occ[c];
    if (j === NONE) return [i, c, NONE];
    if (!model.canSwap(i, j, assign)) return null;
    return [i, c, j];
  };
  const delta = ([i, c, j]: Move) => (j === NONE ? model.deltaRelocate(i, c, assign) : model.deltaSwap(i, j, assign));
  const apply = ([i, c, j]: Move) => {
    const a = assign[i];
    if (j === NONE) {
      occ[a] = NONE;
      assign[i] = c;
      occ[c] = i;
    } else {
      assign[i] = c;
      assign[j] = a;
      occ[c] = i;
      occ[a] = j;
    }
  };

  // Adaptive start temperature: mean |delta| of sampled moves.
  let sum = 0;
  let cnt = 0;
  for (let k = 0; k < 200; k++) {
    const mv = propose();
    if (!mv) continue;
    sum += Math.abs(delta(mv));
    cnt++;
  }
  const T0 = cnt ? Math.max(sum / cnt, 1e-4) : 1e-2;
  const T1 = T0 / 1000;
  const alpha = Math.pow(T1 / T0, 1 / Math.max(iterations, 1));

  let cur = model.totalCost(assign);
  let best = cur;
  let bestAssign = Int32Array.from(assign);
  let temp = T0;
  for (let it = 0; it < iterations; it++, temp *= alpha) {
    const mv = propose();
    if (!mv) continue;
    const d = delta(mv);
    if (d <= 0 || rng() < Math.exp(-d / temp)) {
      apply(mv);
      cur += d;
      if (cur < best - 1e-12) {
        best = cur;
        bestAssign = Int32Array.from(assign);
      }
    }
  }
  return bestAssign;
}

export interface OptimizeOutcome {
  assign: Int32Array;
  score: number;
  greedyScore: number;
  iterations: number;
  restarts: number;
}

export function optimize(model: Model, opts: OptimizerOptions = {}): OptimizeOutcome {
  const iterations = opts.iterations ?? 20000;
  const restarts = opts.anneal === false ? 0 : (opts.restarts ?? 3);
  const seed = opts.seed ?? 1;
  const seedAssign = greedy(model);
  const greedyScore = model.totalCost(seedAssign);
  let best: Int32Array = Int32Array.from(seedAssign);
  descend(model, best);
  let bestScore = model.totalCost(best);
  for (let r = 0; r < restarts; r++) {
    const a = anneal(model, seedAssign, iterations, mulberry32(seed + 7919 * r));
    descend(model, a);
    const s = model.totalCost(a);
    if (s < bestScore - 1e-12) {
      bestScore = s;
      best = a;
    }
  }
  return { assign: best, score: bestScore, greedyScore, iterations, restarts };
}
