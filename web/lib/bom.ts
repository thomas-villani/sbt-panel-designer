/** Bill of materials from a balanced panel. Formats: suspension vials are tests; imaging vials are µg. */
import type { Result } from "@pd3/engine";
import { advancedGroup, kitSupplies, type Index } from "./data";
import type { Conjugate, PanelRow, Setup, Sku } from "./types";

export interface BomLine {
  row: PanelRow;
  metal: string | null;
  conjugate: Conjugate | null;
  sku: Sku | null;
  qty: number;
  note: string | null;
  /** Set when an SBT kit in the panel supplies this vial: no part number of its own, the kit is the SKU. */
  kit?: string;
  tds: string | null;
}

export interface Accessory { label: string; note: string }

const IMAGING_SLIDES_PER_25UG = 50; // assumption for sizing; shown to the user

export function buildBom(idx: Index, rows: PanelRow[], result: Result | null, setup: Setup, nSamples: number): BomLine[] {
  return rows.map((row) => {
    const mass = result?.assignment[row.id] ?? null;
    const metal = mass != null ? idx.instrument(setup.instrumentId).channels.find((c) => c.mass === mass)?.label ?? String(mass) : null;
    if (!row.targetId) return { row, metal, conjugate: null, sku: null, qty: 1, note: "Custom conjugation service (antibody supplied by you or sourced by SBT)", tds: null };
    const adv = advancedGroup(idx, setup, mass);
    const caveat = adv ? ` · ${adv.label}: ${adv.note}` : "";
    const kit = row.moduleIds.map((id) => idx.modulesById.get(id)).find((m) => m?.source === "sbt_kit" && kitSupplies(idx, { ...row, moduleIds: [m.id] }, mass));
    if (kit) return { row, metal, conjugate: null, sku: null, qty: 0, note: caveat ? caveat.slice(3) : null, kit: kit.name, tds: null };
    const conj = mass != null && row.clone
      ? idx.candidates(row.targetId, setup).find((c) => c.clone === row.clone && c.mass === mass) ?? null
      : null;
    if (!conj) {
      const why = mass == null ? "Unassigned: no free channel" : `No catalogue ${row.clone ?? ""} conjugate on ${metal}: custom conjugation (Maxpar X8 kit) or OnDemand`;
      return { row, metal, conjugate: null, sku: null, qty: 1, note: why + caveat, tds: null };
    }
    const { sku, qty } = pickSku(conj, setup, nSamples);
    return { row, metal, conjugate: conj, sku, qty, note: caveat ? caveat.slice(3) : null, tds: conj.tds_url };
  });
}

function pickSku(conj: Conjugate, setup: Setup, nSamples: number): { sku: Sku | null; qty: number } {
  const skus = conj.skus.filter((s) => s.format);
  if (!skus.length) return { sku: conj.skus[0] ?? null, qty: 1 };
  if (setup.modality === "suspension") {
    const tests = skus.filter((s) => s.format!.unit === "tests").sort((a, b) => b.format!.qty - a.format!.qty);
    if (!tests.length) return { sku: skus[0], qty: 1 };
    // Cheapest way to cover nSamples: prefer the large format when it needs fewer vials than small ones would.
    let best = tests[tests.length - 1];
    let bestQty = Math.ceil(nSamples / best.format!.qty);
    for (const s of tests) {
      const q = Math.ceil(nSamples / s.format!.qty);
      if (q * s.format!.qty <= bestQty * best.format!.qty * 1.25 && q < bestQty) { best = s; bestQty = q; }
    }
    return { sku: best, qty: bestQty };
  }
  const ug = skus.filter((s) => s.format!.unit === "ug").sort((a, b) => b.format!.qty - a.format!.qty);
  const s = ug[0] ?? skus[0];
  const slidesPerVial = (s.format!.qty / 25) * IMAGING_SLIDES_PER_25UG;
  return { sku: s, qty: Math.max(1, Math.ceil(nSamples / slidesPerVial)) };
}

export function accessories(idx: Index, setup: Setup, roles: string[]): Accessory[] {
  return idx.instruments.reserved[setup.modality].filter((r) => roles.includes(r.role)).map((r) => ({
    label: r.label, note: `channels ${r.masses.join(", ")} reserved${r.note ? ` - ${r.note}` : ""}`,
  }));
}

export function bomCsv(lines: BomLine[], setup: Setup): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Target", "Clone", "Metal", "Mass", "Abundance", "Part number", "Format", "Qty", "Note", "TDS"];
  const body = lines.map((l) => [
    l.row.name, l.row.clone ?? "custom", l.metal ?? "", l.metal ? Number.parseInt(l.metal) : "", l.row.level,
    l.sku?.part_number ?? "", l.sku?.format?.raw ?? "", l.qty, l.note ?? "", l.tds ?? "",
  ].map(esc).join(","));
  return [`# PD3 panel - ${setup.modality} - ${setup.instrumentId}`, head.map(esc).join(","), ...body].join("\n");
}

export const IMAGING_SIZING_NOTE = `imaging vials sized at ~${IMAGING_SLIDES_PER_25UG} slides per 25 µg (assumption)`;
