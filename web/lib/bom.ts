/**
 * Bill of materials from a balanced panel. Formats: suspension vials are tests; imaging vials are µg.
 *
 * `buildOrder` is the one structured order object: the Order page, the CSV and the future cart / quote sinks all read
 * it, so a kit reaches the quote as the kit and nobody re-derives the custom-conjugation count.
 */
import type { Result } from "@pd3/engine";
import { advancedGroup, channelLabel, kitSupplies, reservedRoles, type Index } from "./data";
import type { Conjugate, PanelModule, PanelRow, Setup, Sku } from "./types";

export interface BomLine {
  row: PanelRow;
  /** Channel label ("176Yb") for display. */
  metal: string | null;
  /** The channel's mass, for anything that needs a number (CSV, cart payload). */
  mass: number | null;
  conjugate: Conjugate | null;
  sku: Sku | null;
  qty: number;
  note: string | null;
  /** Set when an SBT kit in the panel supplies this vial: no part number of its own, the kit is the SKU. */
  kit?: string;
  tds: string | null;
}

export interface Accessory { label: string; note: string }

/** A kit the panel draws vials from. The kit is the purchasable unit (ROADMAP §4: "keep kits whole"). */
export interface KitLine {
  moduleId: string;
  name: string;
  /** Catalogue part number once the ETL carries one; null today (ROADMAP §8 ask 3). */
  partNumber: string | null;
  /** Row ids this kit supplies on its own metals. */
  rowIds: string[];
}

/** Spill the user signed off, as it should read on a quote. */
export interface AcceptedSpill { rowId: string; name: string; channel: string | null; receivedPct: number | null; from: string | null; reason: string }

export interface Order {
  setup: Setup;
  nSamples: number;
  /** One line per panel row, in panel order (kit-supplied rows carry `kit` and no SKU). */
  lines: BomLine[];
  kits: KitLine[];
  /** Lines that need a conjugation to order: no SKU and not in a kit. */
  custom: BomLine[];
  accessories: Accessory[];
  accepted: AcceptedSpill[];
  catalogVersion: string;
}

const IMAGING_SLIDES_PER_25UG = 50; // assumption for sizing; shown to the user
export const IMAGING_SIZING_NOTE = `imaging vials sized at ~${IMAGING_SLIDES_PER_25UG} slides per 25 µg (assumption)`;
export const HAND_SIZED_NOTE = "sold by volume only: size by hand from the TDS dilution";

export function buildBom(idx: Index, rows: PanelRow[], result: Result | null, setup: Setup, nSamples: number): BomLine[] {
  return rows.map((row) => {
    const mass = result?.assignment[row.id] ?? null;
    const metal = mass != null ? channelLabel(idx, setup, mass) : null;
    if (!row.targetId) return { row, metal, mass, conjugate: null, sku: null, qty: 1, note: "Custom conjugation service (antibody supplied by you or sourced by SBT)", tds: null };
    const adv = advancedGroup(idx, setup, mass);
    const caveat = adv ? `${adv.label}: ${adv.note}` : null;
    const kit = supplyingKit(idx, row, mass);
    if (kit) return { row, metal, mass, conjugate: null, sku: null, qty: 0, note: caveat, kit: kit.name, tds: null };
    const conj = mass != null && row.clone
      ? idx.candidates(row.targetId, setup).find((c) => c.clone === row.clone && c.mass === mass) ?? null
      : null;
    if (!conj) {
      const why = mass == null ? "Unassigned: no free channel" : `No catalogue ${row.clone ?? ""} conjugate on ${metal}: custom conjugation (Maxpar X8 kit) or OnDemand`;
      return { row, metal, mass, conjugate: null, sku: null, qty: 1, note: joinNotes(why, caveat), tds: null };
    }
    const { sku, qty, note } = pickSku(conj, setup, nSamples);
    return { row, metal, mass, conjugate: conj, sku, qty, note: joinNotes(note, caveat), tds: conj.tds_url };
  });
}

const joinNotes = (...xs: (string | null)[]) => { const s = xs.filter(Boolean).join(" · "); return s || null; };

function supplyingKit(idx: Index, row: PanelRow, mass: number | null): PanelModule | null {
  return row.moduleIds.map((id) => idx.modulesById.get(id)).find((m): m is PanelModule => !!m && m.source === "sbt_kit" && kitSupplies(idx, { ...row, moduleIds: [m.id] }, mass)) ?? null;
}

function pickSku(conj: Conjugate, setup: Setup, nSamples: number): { sku: Sku | null; qty: number; note: string | null } {
  const skus = conj.skus.filter((s) => s.format);
  if (!skus.length) return { sku: conj.skus[0] ?? null, qty: 1, note: null };
  if (setup.modality === "suspension") {
    const tests = skus.filter((s) => s.format!.unit === "tests").sort((a, b) => b.format!.qty - a.format!.qty);
    // Some conjugates are sold by volume only (25 µL): we cannot turn that into tests without the TDS dilution, so say so.
    if (!tests.length) return { sku: skus[0], qty: 1, note: HAND_SIZED_NOTE };
    // Cheapest way to cover nSamples: prefer the large format when it needs fewer vials than small ones would.
    let best = tests[tests.length - 1];
    let bestQty = Math.ceil(nSamples / best.format!.qty);
    for (const s of tests) {
      const q = Math.ceil(nSamples / s.format!.qty);
      if (q * s.format!.qty <= bestQty * best.format!.qty * 1.25 && q < bestQty) { best = s; bestQty = q; }
    }
    return { sku: best, qty: bestQty, note: null };
  }
  const ug = skus.filter((s) => s.format!.unit === "ug").sort((a, b) => b.format!.qty - a.format!.qty);
  const s = ug[0] ?? skus[0];
  const slidesPerVial = (s.format!.qty / 25) * IMAGING_SLIDES_PER_25UG;
  return { sku: s, qty: Math.max(1, Math.ceil(nSamples / slidesPerVial)), note: null };
}

export function accessories(idx: Index, setup: Setup, roles: string[] = reservedRoles(setup)): Accessory[] {
  return idx.instruments.reserved[setup.modality].filter((r) => roles.includes(r.role)).map((r) => ({
    label: r.label, note: `channels ${r.masses.join(", ")} reserved${r.note ? ` - ${r.note}` : ""}`,
  }));
}

/** The whole order, structured. Pure: same panel in, same object out. */
export function buildOrder(idx: Index, rows: PanelRow[], result: Result | null, setup: Setup, nSamples: number): Order {
  const lines = buildBom(idx, rows, result, setup, nSamples);
  const kitRows = new Map<string, string[]>();
  for (const l of lines) {
    const kit = supplyingKit(idx, l.row, l.mass);
    if (kit) kitRows.set(kit.id, [...(kitRows.get(kit.id) ?? []), l.row.id]);
  }
  const kits: KitLine[] = [...kitRows.entries()].map(([moduleId, rowIds]) => ({ moduleId, name: idx.modulesById.get(moduleId)?.name ?? moduleId, partNumber: null, rowIds }));
  const rr = new Map(result?.rows.map((r) => [r.rowId, r]) ?? []);
  const accepted: AcceptedSpill[] = rows.filter((r) => r.accepted).map((r) => {
    const x = rr.get(r.id);
    const top = x?.contributions[0];
    return { rowId: r.id, name: r.name, channel: x?.channel ?? null, receivedPct: x ? Math.round(x.receivedOverT * 100) : null, from: top?.label ?? null, reason: r.accepted! };
  });
  return {
    setup, nSamples, lines, kits, custom: lines.filter((l) => !l.sku && !l.kit), accessories: accessories(idx, setup), accepted,
    catalogVersion: idx.bundles.catalog.version,
  };
}

export function bomCsv(lines: BomLine[], setup: Setup): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Target", "Clone", "Metal", "Mass", "Abundance", "Part number", "Format", "Qty", "Note", "TDS"];
  const body = lines.map((l) => [
    l.row.name, l.row.clone ?? "custom", l.metal ?? "", l.mass ?? "", l.row.level,
    l.sku?.part_number ?? (l.kit ? `in kit: ${l.kit}` : ""), l.sku?.format?.raw ?? "", l.sku ? l.qty : "", l.note ?? "", l.tds ?? "",
  ].map(esc).join(","));
  return [`# PD3 panel - ${setup.modality} - ${setup.instrumentId}`, head.map(esc).join(","), ...body].join("\n");
}
