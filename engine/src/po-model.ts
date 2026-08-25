/**
 * Percent-overlap spillover model (pdv2 semantics).
 *   SO(donor -> recipient) = S_donor * PO[donor][recipient] / 100
 *   objective             = sum over rows  received_SO(row) / T(row)
 * plus unary soft terms (sensitivity, flagged channels, caller-supplied per-channel costs).
 * Everything is index-based (rows 0..n-1, channels 0..m-1) so the optimiser's deltas are cheap.
 */
import type { Mechanism, Problem, RangeClass, Row, Weights } from "./types";
import { DEFAULT_WEIGHTS } from "./types";

export const NONE = -1;

export function dimness(tolerance: number): number {
  return 1 / (1 + tolerance / 10);
}

export function mechanismOf(donorMass: number, recipientMass: number, donorEl: string, recipientEl: string): Mechanism {
  const d = recipientMass - donorMass;
  if (d === 16) return "oxide";
  if (d === 1 || d === -1) return "adjacent";
  if (donorEl === recipientEl) return "isotope";
  return "other";
}

export class Model {
  readonly rows: Row[];
  readonly n: number;
  readonly weights: Weights;
  readonly masses: number[] = [];
  readonly labels: string[] = [];
  readonly elements: string[] = [];
  readonly relSens: number[] = [];
  readonly rangeClass: (RangeClass | null)[] = [];
  readonly flaggedCh: Uint8Array;
  /** channels that exist only because a row is locked on a reserved / unusable mass */
  readonly reservedCh: Uint8Array;
  readonly massIndex = new Map<number, number>();
  readonly m: number;
  /** effective PO fraction [donorCh][recipientCh] incl. oxide/adjacent weights */
  readonly frac: Float64Array[];
  /** raw PO fraction (pct/100) for explanations and the pure objective */
  readonly rawFrac: Float64Array[];
  readonly S: Float64Array;
  readonly T: Float64Array;
  readonly locked: Int32Array; // channel index or NONE
  readonly domains: Int32Array[]; // per row: channel indices it may take (locked rows: exactly their channel)
  readonly allowed: Uint8Array[]; // per row: allowed[ch]
  readonly unary: Float64Array[]; // per row per channel
  readonly interact: Uint8Array[]; // per row pair
  readonly movable: number[]; // unlocked row indices

  constructor(readonly problem: Problem) {
    this.rows = problem.rows;
    this.n = this.rows.length;
    this.weights = { ...DEFAULT_WEIGHTS, ...(problem.weights ?? {}) };
    const reserved = new Set(problem.reserved);
    const flagged = new Set(problem.flagged ?? []);
    const chDefs = new Map(problem.instrument.channels.map((c) => [c.mass, c]));
    const lockedMasses = new Set(this.rows.map((r) => r.locked).filter((x): x is number => x != null));

    // Channel universe: usable, non-reserved instrument channels, plus any mass a row is locked on.
    const universe = new Set<number>();
    for (const c of problem.instrument.channels) if (c.usable && !reserved.has(c.mass)) universe.add(c.mass);
    for (const x of lockedMasses) universe.add(x);
    const sorted = [...universe].sort((a, b) => a - b);
    this.reservedCh = new Uint8Array(sorted.length);
    this.flaggedCh = new Uint8Array(sorted.length);
    sorted.forEach((mass, i) => {
      const def = chDefs.get(mass);
      this.masses.push(mass);
      this.labels.push(def?.label ?? String(mass));
      this.elements.push(def?.element ?? "");
      this.relSens.push(def?.rel_sensitivity ?? 0.3);
      this.rangeClass.push(def?.range_class ?? null);
      this.massIndex.set(mass, i);
      if (!def?.usable || reserved.has(mass)) this.reservedCh[i] = 1;
      if (flagged.has(mass)) this.flaggedCh[i] = 1;
    });
    this.m = sorted.length;

    // PO fractions.
    const { w_oxide, w_adjacent } = this.weights;
    this.frac = [];
    this.rawFrac = [];
    for (let d = 0; d < this.m; d++) {
      const row = problem.po.pct[String(this.masses[d])] ?? {};
      const f = new Float64Array(this.m);
      const rf = new Float64Array(this.m);
      for (let r = 0; r < this.m; r++) {
        const pct = row[String(this.masses[r])];
        if (!pct) continue;
        const diff = this.masses[r] - this.masses[d];
        let w = 1;
        if (diff === 16) w += w_oxide;
        if (diff === 1 || diff === -1) w += w_adjacent;
        rf[r] = pct / 100;
        f[r] = (pct / 100) * w;
      }
      this.frac.push(f);
      this.rawFrac.push(rf);
    }

    // Rows.
    this.S = new Float64Array(this.n);
    this.T = new Float64Array(this.n);
    this.locked = new Int32Array(this.n).fill(NONE);
    this.domains = [];
    this.allowed = [];
    this.unary = [];
    this.movable = [];
    this.rows.forEach((row, i) => {
      if (!(row.signal > 0) || !(row.tolerance > 0)) throw new Error(`row ${row.id}: signal and tolerance must be > 0`);
      this.S[i] = row.signal;
      this.T[i] = row.tolerance;
      const allowed = new Uint8Array(this.m);
      const dom: number[] = [];
      if (row.locked != null) {
        const c = this.massIndex.get(row.locked)!;
        this.locked[i] = c;
        allowed[c] = 1;
        dom.push(c);
      } else {
        this.movable.push(i);
        for (const mass of row.domain) {
          const c = this.massIndex.get(mass);
          if (c == null || this.reservedCh[c] || allowed[c]) continue;
          allowed[c] = 1;
          dom.push(c);
        }
        dom.sort((a, b) => a - b);
      }
      this.allowed.push(allowed);
      this.domains.push(Int32Array.from(dom));
      const u = new Float64Array(this.m);
      const dim = dimness(row.tolerance) * (row.critical ? 2 : 1);
      for (let c = 0; c < this.m; c++) {
        u[c] = this.weights.w_sens * (1 - this.relSens[c]) * dim;
        if (this.flaggedCh[c]) u[c] += this.weights.w_flagged;
        const extra = row.unary?.[this.masses[c]];
        if (extra) u[c] += extra;
      }
      this.unary.push(u);
    });

    // Group exclusivity (pdv2): rows in disjoint non-empty group sets never interact.
    this.interact = [];
    for (let i = 0; i < this.n; i++) {
      const gi = this.rows[i].groups ?? [];
      const arr = new Uint8Array(this.n);
      for (let j = 0; j < this.n; j++) {
        if (i === j) continue;
        const gj = this.rows[j].groups ?? [];
        arr[j] = gi.length && gj.length && !gi.some((g) => gj.includes(g)) ? 0 : 1;
      }
      this.interact.push(arr);
    }
  }

  /** Cost of the unordered pair {i at ci, j at cj}: both directions of spillover, each over the recipient's tolerance. */
  pairCost(i: number, ci: number, j: number, cj: number): number {
    if (!this.interact[i][j] || ci === cj) return 0;
    return (this.S[j] * this.frac[cj][ci]) / this.T[i] + (this.S[i] * this.frac[ci][cj]) / this.T[j];
  }

  /** Unary cost of row i at ci plus all pair costs against currently assigned rows (except `skip`). */
  rowCost(i: number, ci: number, assign: Int32Array, skip = NONE): number {
    let c = this.unary[i][ci];
    for (let j = 0; j < this.n; j++) {
      if (j === i || j === skip) continue;
      const cj = assign[j];
      if (cj !== NONE) c += this.pairCost(i, ci, j, cj);
    }
    return c;
  }

  totalCost(assign: Int32Array): number {
    let c = 0;
    for (let i = 0; i < this.n; i++) {
      const ci = assign[i];
      if (ci === NONE) continue;
      c += this.unary[i][ci];
      for (let j = i + 1; j < this.n; j++) {
        const cj = assign[j];
        if (cj !== NONE) c += this.pairCost(i, ci, j, cj);
      }
    }
    return c;
  }

  /** Raw received spillover (dual counts) for row i at its assigned channel. */
  received(i: number, assign: Int32Array): number {
    const ci = assign[i];
    if (ci === NONE) return 0;
    let so = 0;
    for (let j = 0; j < this.n; j++) {
      const cj = assign[j];
      if (j === i || cj === NONE || !this.interact[i][j] || cj === ci) continue;
      so += this.S[j] * this.rawFrac[cj][ci];
    }
    return so;
  }

  /** pdv2 objective: sum received SO / T over assigned rows (no soft terms, no weights). */
  objective(assign: Int32Array): number {
    let o = 0;
    for (let i = 0; i < this.n; i++) if (assign[i] !== NONE) o += this.received(i, assign) / this.T[i];
    return o;
  }

  deltaRelocate(i: number, to: number, assign: Int32Array): number {
    return this.rowCost(i, to, assign) - this.rowCost(i, assign[i], assign);
  }

  deltaSwap(i: number, j: number, assign: Int32Array): number {
    const a = assign[i];
    const b = assign[j];
    const before = this.rowCost(i, a, assign, j) + this.rowCost(j, b, assign, i) + this.pairCost(i, a, j, b);
    const after = this.rowCost(i, b, assign, j) + this.rowCost(j, a, assign, i) + this.pairCost(i, b, j, a);
    return after - before;
  }

  canSwap(i: number, j: number, assign: Int32Array): boolean {
    return (
      this.locked[i] === NONE &&
      this.locked[j] === NONE &&
      assign[i] !== NONE &&
      assign[j] !== NONE &&
      this.allowed[i][assign[j]] === 1 &&
      this.allowed[j][assign[i]] === 1
    );
  }
}
