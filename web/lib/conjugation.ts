/**
 * Custom-conjugation checks, run after every balance.
 *
 * The engine only knows physics: it will happily park a marker on a metal that nobody sells, because as far as the
 * optimiser is concerned a custom conjugation may use any Maxpar X8 lanthanide. That is a real cost and a real lead
 * time, so it must show up next to the spillover warnings rather than as a surprise in the bill of materials.
 */
import type { Result } from "@pd3/engine";
import { channelLabel, kitSupplies, reservedRoles, type Index } from "./data";
import type { PanelRow, Setup } from "./types";

export interface ConjugationIssue {
  rowId: string;
  name: string;
  channel: string;
  /** no_conjugate: nothing is sold for this target at all. metal_not_sold: the clone exists, but not on this channel. */
  kind: "no_conjugate" | "metal_not_sold";
  message: string;
  detail: string | null;
  /** A free channel where this clone *is* sold, when one exists. */
  fix: { mass: number; channel: string } | null;
}

export function conjugationIssues(idx: Index, rows: PanelRow[], result: Result, setup: Setup): ConjugationIssue[] {
  const here = setup.modality === "imaging" ? "IMC" : "CyTOF";
  const there = setup.modality === "imaging" ? "CyTOF" : "IMC";
  const taken = new Set<number>();
  for (const r of rows) {
    const m = result.assignment[r.id];
    if (m != null) taken.add(m);
  }
  const off = new Set<number>(setup.blocked);
  const enabled = reservedRoles(setup);
  for (const role of idx.instruments.reserved[setup.modality]) if (enabled.includes(role.role)) for (const m of role.masses) off.add(m);
  const usable = new Set(idx.instrument(setup.instrumentId).channels.filter((c) => c.usable).map((c) => c.mass));
  const label = (m: number) => channelLabel(idx, setup, m);

  const out: ConjugationIssue[] = [];
  for (const row of rows) {
    const mass = result.assignment[row.id];
    if (mass == null || !row.targetId) continue; // unassigned rows already carry an engine warning; typed-in markers are knowingly custom
    if (kitSupplies(idx, row, mass)) continue; // the kit box has this vial
    const cands = idx.candidates(row.targetId, setup);

    if (!cands.length) {
      const all = (idx.conjugatesByTarget.get(row.targetId) ?? []).filter((c) => c.kind === "antibody");
      const sameApp = all.filter((c) => c.application === setup.modality);
      const detail = sameApp.length
        ? `Sold for ${here}, but not validated for ${setup.species} (reactivity: ${[...new Set(sameApp.flatMap((c) => c.reactivity))].join(", ")}).`
        : all.length ? `Sold for ${there} only.` : "Not in the Maxpar catalogue.";
      out.push({
        rowId: row.id, name: row.name, channel: label(mass), kind: "no_conjugate",
        message: `${row.name} has no off-the-shelf ${here} conjugate, so ${label(mass)} would be a custom conjugation (Maxpar X8 labelling, extra lead time).`,
        detail, fix: null,
      });
      continue;
    }

    if (!row.clone) continue; // "custom conjugation" chosen deliberately in the clone picker
    if (row.custom && row.locked === mass) continue; // pinned by hand to a metal the clone is not sold on: a vial of their own
    const sold = row.clonePinned ? cands.filter((c) => c.clone === row.clone) : cands;
    if (sold.some((c) => c.mass === mass)) continue;
    const free = [...new Set(sold.map((c) => c.mass))].filter((m) => usable.has(m) && !off.has(m) && !taken.has(m)).sort((a, b) => a - b);
    out.push({
      rowId: row.id, name: row.name, channel: label(mass), kind: "metal_not_sold",
      message: row.clonePinned
        ? `${row.name} (clone ${row.clone}) sits on ${label(mass)}, which that clone is not sold on: it would be a custom conjugation.`
        : `${row.name} sits on ${label(mass)}, which no catalogue clone is sold on: it would be a custom conjugation.`,
      detail: free.length ? null : `Every catalogue metal for ${row.clonePinned ? "this clone" : "this marker"} (${[...new Set(sold.map((c) => c.metal))].join(", ")}) is taken or reserved — free one up, or accept the custom conjugation.`,
      fix: free.length ? { mass: free[0], channel: label(free[0]) } : null,
    });
  }
  return out;
}
