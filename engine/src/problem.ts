/** Build a Problem from the instrument bundle and user-level row specs. */
import { massOf } from "./metals";
import { signalTolerance } from "./prior";
import type { AbundanceLevel, ChannelDef, InstrumentBundle, InstrumentDef, Modality, Problem, Row, Weights } from "./types";

/** Fallback custom-conjugation metals when the bundle carries no `conjugation` lists: Maxpar X8 lanthanides (+89Y). */
export const X8_MASSES = [
  89, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 158, 159, 160, 161, 162, 163, 164,
  165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176,
];
/** Maxpar MCP9 cadmium kit (suspension instruments only). */
export const MCP9_MASSES = [106, 110, 111, 112, 113, 114, 116];

export interface RowSpec {
  id: string;
  label: string;
  /** Titrated S/T if known; otherwise `level` drives the abundance prior. */
  signal?: number | null;
  tolerance?: number | null;
  level?: AbundanceLevel | null;
  /** Catalogue metal labels ("162Dy") or masses this row may take. */
  metals?: (string | number)[];
  /** Also allow every labelling-kit metal usable on the instrument (custom conjugation). */
  allowCustom?: boolean;
  locked?: string | number | null;
  groups?: string[];
  unary?: Record<number, number>;
  critical?: boolean;
}

export interface BuildOptions {
  instrumentId?: string;
  modality?: Modality;
  rows: RowSpec[];
  /** Reserved roles to apply (ids from bundle.reserved[modality]); default = roles flagged `default: true`. */
  reservedRoles?: string[] | null;
  extraReserved?: number[];
  /** Masses the user opted into although SBT lists no conjugation metal for them on this modality (see bundle.advanced). */
  extraMetals?: number[];
  /** Masses to release from reservation (e.g. a kit that legitimately uses 195Pt). */
  unreserve?: number[];
  weights?: Partial<Weights>;
}

/** A channel the instrument detects and SBT sells a conjugation metal for. */
export function canCarryAntibody(c: ChannelDef): boolean {
  return c.usable && c.antibody !== false;
}

export function pickInstrument(bundle: InstrumentBundle, id?: string, modality?: Modality): InstrumentDef {
  if (id) {
    const inst = bundle.instruments.find((i) => i.id === id);
    if (!inst) throw new Error(`unknown instrument ${id}`);
    return inst;
  }
  const mod = modality ?? "suspension";
  return bundle.instruments.find((i) => i.modality === mod && i.default_for_modality) ??
    bundle.instruments.find((i) => i.modality === mod && i.current)!;
}

export function buildProblem(bundle: InstrumentBundle, opts: BuildOptions): Problem {
  const instrument = pickInstrument(bundle, opts.instrumentId, opts.modality);
  const po = bundle.po_matrices[String(instrument.po_matrix)];
  if (!po) throw new Error(`no PO matrix ${instrument.po_matrix} for ${instrument.id}`);
  const roles = bundle.reserved[instrument.modality] ?? [];
  const enabled = opts.reservedRoles
    ? roles.filter((r) => opts.reservedRoles!.includes(r.role))
    : roles.filter((r) => r.default);
  const release = new Set(opts.unreserve ?? []);
  const reserved = new Set<number>(opts.extraReserved ?? []);
  const flagged = new Set<number>();
  for (const r of enabled) for (const m of r.masses) (r.hard ? reserved : flagged).add(m);
  for (const m of release) reserved.delete(m);

  const extra = new Set(opts.extraMetals ?? []);
  const usable = new Set(instrument.channels.filter((c) => canCarryAntibody(c) || (c.usable && extra.has(c.mass))).map((c) => c.mass));
  const custom = [...(bundle.conjugation?.[instrument.modality]?.masses ??
    [...X8_MASSES, ...(instrument.modality === "suspension" ? MCP9_MASSES : [])]), ...extra];
  const customMasses = [...new Set(custom)].filter((m) => usable.has(m));

  const rows: Row[] = opts.rows.map((spec) => {
    const st = signalTolerance({ signal: spec.signal, tolerance: spec.tolerance }, spec.level);
    const dom = new Set<number>();
    for (const m of spec.metals ?? []) {
      const mass = typeof m === "number" ? m : massOf(m);
      if (mass != null) dom.add(mass);
    }
    if (spec.allowCustom) for (const m of customMasses) dom.add(m);
    const locked = typeof spec.locked === "number" ? spec.locked : massOf(spec.locked ?? null);
    if (locked != null && usable.has(locked)) dom.add(locked); // a pinned vial is what the user has, catalogue or not
    return {
      id: spec.id, label: spec.label, signal: st.signal, tolerance: st.tolerance,
      domain: [...dom].sort((a, b) => a - b), locked, groups: spec.groups, unary: spec.unary, critical: spec.critical,
    };
  });

  return { instrument, po, rows, reserved: [...reserved].sort((a, b) => a - b), flagged: [...flagged].sort((a, b) => a - b), weights: opts.weights };
}
