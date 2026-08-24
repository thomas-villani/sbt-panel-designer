/** Types mirroring data/build/instruments.json plus the engine's problem/result contracts. */

export type Modality = "suspension" | "imaging";
export type AbundanceLevel = "low" | "medium" | "high" | "very_high";
export type RangeClass = "bright_only" | "mid" | "sweet_spot" | "heavy";

export interface ChannelDef {
  mass: number;
  element: string;
  label: string; // e.g. "162Dy"
  rel_sensitivity: number; // 0.3 .. 1.0 from the pdv2 massbias curve
  usable: boolean; // present in the instrument's sensitivity curve
  in_po_matrix: boolean;
  range_class: RangeClass;
}

export interface InstrumentDef {
  id: string;
  name: string;
  modality: Modality;
  pdv2_id: number;
  po_matrix: number;
  sensitivity_curve: number;
  current: boolean;
  default_for_modality?: boolean;
  channels: ChannelDef[];
}

/** Percent-overlap matrix: pct[donorMass][recipientMass] = % of donor signal seen in recipient (off-diagonal, non-zero only). */
export interface PoMatrix {
  donors: number[];
  recipients: number[];
  pct: Record<string, Record<string, number>>;
  anomalies: string[];
}

export interface ReservedRole {
  role: string;
  label: string;
  masses: number[];
  default: boolean;
  hard: boolean;
  note?: string;
}

export interface InstrumentBundle {
  version: string;
  isotopes: Record<string, string>;
  po_matrices: Record<string, PoMatrix>;
  sensitivity_curves: Record<string, Record<string, number>>;
  instruments: InstrumentDef[];
  reserved: Record<Modality, ReservedRole[]>;
}

/** One panel row = one target that needs a channel. */
export interface Row {
  id: string;
  label: string; // display name, e.g. "CD8a (SK1)"
  signal: number; // expected dual counts on positive cells (S)
  tolerance: number; // acceptable received spillover in dual counts (T)
  /** Masses this row may occupy: catalogue metals for its clone, or every labelling-kit metal when custom is allowed. */
  domain: number[];
  /** Locked channel (mass). A locked row never moves; its mass need not be in `domain`. */
  locked?: number | null;
  /** Population groups. Rows whose group sets are both non-empty and disjoint never spill onto each other (pdv2 rule). */
  groups?: string[];
  /** Extra per-channel cost in SO/T units (on-demand / custom / not-kit penalties). Missing = 0. */
  unary?: Record<number, number>;
  /** Critical rows get double weight on the sensitivity term. */
  critical?: boolean;
}

export interface Weights {
  /** Pushes dim rows into high-sensitivity channels. 0 = pure pdv2 objective. */
  w_sens: number;
  /** Extra multiplier on oxide (M+16) PO cells: PO' = PO * (1 + w_oxide). */
  w_oxide: number;
  /** Extra multiplier on M+-1 PO cells. */
  w_adjacent: number;
  /** Cost of sitting on a soft-reserved channel (EQ beads etc). */
  w_flagged: number;
}

export const DEFAULT_WEIGHTS: Weights = { w_sens: 0.2, w_oxide: 0, w_adjacent: 0, w_flagged: 0.05 };
export const PDV2_WEIGHTS: Weights = { w_sens: 0, w_oxide: 0, w_adjacent: 0, w_flagged: 0 };

export interface Problem {
  instrument: InstrumentDef;
  po: PoMatrix;
  rows: Row[];
  /** Hard-reserved masses (DNA intercalator, barcoding ...). Never assigned. */
  reserved: number[];
  /** Soft-reserved masses (EQ beads): allowed but penalised and flagged. */
  flagged?: number[];
  weights?: Partial<Weights>;
}

export interface OptimizerOptions {
  iterations?: number; // annealing steps per restart (default 20000)
  restarts?: number; // independent annealing runs, best kept (default 3)
  seed?: number; // PRNG seed for determinism (default 1)
  anneal?: boolean; // false = greedy + local descent only
}

export type Mechanism = "oxide" | "adjacent" | "isotope" | "other";

export interface Contribution {
  rowId: string;
  label: string;
  mass: number;
  so: number; // dual counts
  fraction: number; // of the receiving row's tolerance
  mechanism: Mechanism;
  pct: number; // PO % used
}

export interface RowResult {
  rowId: string;
  label: string;
  mass: number | null;
  channel: string | null; // e.g. "162Dy"
  locked: boolean;
  rel_sensitivity: number | null;
  range_class: RangeClass | null;
  received: number; // total SO received (dual counts)
  receivedOverT: number; // received / tolerance
  contributions: Contribution[]; // who spills into me (desc)
  given: Contribution[]; // whom I spill into (desc, fraction = of their tolerance)
  reasons: string[];
}

export interface Fix {
  rowId: string;
  to: number;
  toChannel: string;
  /** Swap partner (moves to the fixed row's old channel) when the target channel is occupied. */
  swapWith?: string;
  delta: number; // change in total score (negative = better)
  message: string;
}

export interface Warning {
  severity: "info" | "warning" | "critical";
  rowId: string;
  code: "spillover" | "unassigned" | "flagged_channel" | "dim_bright_channel" | "reserved_lock";
  message: string;
  fix?: Fix;
}

export interface Result {
  assignment: Record<string, number>; // rowId -> mass (assigned rows only)
  score: number; // full objective incl. soft terms
  objective: number; // pure pdv2 objective: sum received SO / T
  softCost: number;
  rows: RowResult[];
  warnings: Warning[];
  unassigned: string[];
  stats: { greedyScore: number; iterations: number; restarts: number; ms: number };
}
