/**
 * One reading of the panel's state, derived from the last balance result, shared by the sidebar, the Build page and
 * the Balance page so they never disagree about what needs doing.
 *
 * The engine reports residuals: everything the optimiser could not solve, one warning per marker, in physics terms.
 * Users think in decisions: is the panel too big, which marker do I drop, which spill is real. This module regroups
 * the residuals into those decisions.
 */
import { SPILL_CRIT, SPILL_WARN, type Result, type Warning } from "@pd3/engine";
import { conjugationIssues, type ConjugationIssue } from "./conjugation";
import { advancedGroup, channelBudget, channelLabel, kitSupplies, rowMetals, type Index } from "./data";
import type { PanelRow, Setup } from "./types";

export interface DropCandidate {
  row: PanelRow;
  reason: string;
  /** The marker has a catalogue clone but every metal it is sold on is taken: custom conjugation frees it. */
  canGoCustom?: boolean;
}

export interface ModuleDrop {
  id: string;
  name: string;
  /** Channels removing this module frees: its markers that no other module in the panel also uses. */
  frees: number;
}

export interface Health {
  budget: number;
  /** Markers beyond what the instrument can hold. */
  over: number;
  /** Rows the engine could not place (over budget, or every metal their clone is sold on is taken). */
  unassigned: PanelRow[];
  /** Ranked suggestions for what to drop when the panel is too big. */
  drops: DropCandidate[];
  /** Whole modules to remove, most channels freed first; the natural unit when the panel is far over budget. */
  moduleDrops: ModuleDrop[];
  /** Serious spillover and locks on unusable channels: must be dealt with. */
  conflicts: Warning[];
  /** Spillover at or above 1× tolerance (SPILL_WARN) but under the must-fix line, dim markers on weak channels: worth a look. */
  checks: Warning[];
  /** EQ bead channels and the like: fine, just so you know. */
  notes: Warning[];
  /** Spill between markers that are never on the same cell (one is a lineage negative of the other's cell type). */
  unlikely: { w: Warning; why: string }[];
  /** Spill the user looked at and signed off, with their reason. */
  accepted: { w: Warning; reason: string }[];
  /** A catalogue clone exists but the engine parked it on a metal it is not sold on: move it or accept the custom conjugation. */
  custom: ConjugationIssue[];
  /** No catalogue antibody for this setup at all: conjugated to order, known since Build. A cost, not a problem. */
  customKnown: ConjugationIssue[];
  /** Rows the user (or a fix) pinned to a channel. */
  pinned: PanelRow[];
  tone: "rose" | "amber" | "emerald" | "slate";
  /** One line for the sidebar, e.g. "6 over budget" or "fits · 2 to fix". */
  headline: string;
  /** Everything that is not merely informational. */
  todo: number;
  /** The panel does not fit (over budget or a marker without a channel): everything else is provisional. */
  blocked: boolean;
  /** Conflicts + metal-not-sold rows, once the panel fits. */
  mustFix: number;
  /** The Balance page's heading and its hint, so the page and the sidebar always tell the same story. */
  pageHeadline: string;
  pageHint: string | null;
}

const byRow = (result: Result) => new Map(result.rows.map((r) => [r.rowId, r]));

export function panelHealth(idx: Index, setup: Setup, rows: PanelRow[], result: Result | null, opts: { quiet?: boolean } = {}): Health {
  const budget = channelBudget(idx, setup);
  const over = Math.max(0, rows.length - budget);
  const moduleDrops = over ? moduleDropCandidates(idx, rows) : [];
  const empty: Health = { budget, over, unassigned: [], drops: [], moduleDrops, conflicts: [], checks: [], notes: [], unlikely: [], accepted: [], custom: [], customKnown: [], pinned: [], tone: "slate", headline: "", todo: 0, blocked: over > 0, mustFix: 0, pageHeadline: "", pageHint: null };
  if (!result) {
    if (over) return { ...empty, tone: "rose", headline: `${over} over budget`, todo: over, pageHeadline: "The panel does not fit yet" };
    return { ...empty, headline: rows.length ? "checking…" : "" };
  }
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const unassigned = result.unassigned.map((id) => rowById.get(id)).filter((r): r is PanelRow => !!r);
  const issues = conjugationIssues(idx, rows, result, setup);
  const custom = issues.filter((c) => c.kind === "metal_not_sold");
  const customKnown = issues.filter((c) => c.kind === "no_conjugate");
  const pinned = rows.filter((r) => r.locked != null);
  // Spillover warnings are noise on a five-marker panel: every marker has the whole strip to itself and the picture
  // changes completely with each addition. Budget and conjugation problems are real from the first marker.
  const quiet = opts.quiet ?? false;
  const all = quiet ? result.warnings.filter((x) => x.code === "unassigned" || x.code === "reserved_lock") : result.warnings;
  // Spillover the user signed off, and spillover between markers that never share a cell, leave the to-do list.
  const rr = byRow(result);
  const excl = exclusivePairs(idx, setup);
  const unlikely: Health["unlikely"] = [];
  const accepted: Health["accepted"] = [];
  const w = all.filter((x) => {
    if (x.code !== "spillover") return true;
    const row = rowById.get(x.rowId);
    if (row?.accepted) { accepted.push({ w: x, reason: row.accepted }); return false; }
    const donor = rr.get(x.rowId)?.contributions[0];
    const donorRow = donor ? rowById.get(donor.rowId) : undefined;
    const why = row?.targetId && donorRow?.targetId ? excl.get(pairKey(row.targetId, donorRow.targetId)) : undefined;
    if (why) { unlikely.push({ w: x, why: `${donorRow!.name} and ${row!.name} are not on the same cells (${why}), so the spill lands where there is no signal to blur.` }); return false; }
    const kit = row && donorRow ? sharedKit(idx, row, donorRow, rr.get(x.rowId)?.mass ?? null, donor?.mass ?? null) : null;
    if (kit) { unlikely.push({ w: x, why: `${donorRow!.name} and ${row!.name} ship together on these metals in ${kit}, which Standard BioTools validated as a set.` }); return false; }
    return true;
  });
  // Must-fix: anything critical except "no channel" (that is the budget story above), plus a pin on a channel that cannot take it.
  const conflicts = w.filter((x) => (x.code !== "unassigned" && x.severity === "critical") || x.code === "reserved_lock");
  const checks = w.filter((x) => x.severity === "warning" && x.code !== "reserved_lock");
  const notes = w.filter((x) => x.severity === "info" && x.code !== "reserved_lock");
  for (const r of rows) {
    const g = advancedGroup(idx, setup, result.assignment[r.id] ?? null);
    if (g) notes.push({ severity: "info", rowId: r.id, code: "advanced_metal", message: `${r.name} sits on ${channelLabel(idx, setup, result.assignment[r.id]!)}, ${g.label} — ${g.note}` });
  }
  const drops = dropCandidates(idx, setup, rows, result, unassigned, custom, over);
  const blocked = over > 0 || unassigned.length > 0;
  // While the panel does not fit, the spillover picture is provisional: it does not count as "to fix" yet.
  const mustFix = blocked ? 0 : conflicts.length + custom.length;
  const todo = Math.max(over, unassigned.length) + mustFix + (blocked ? 0 : checks.length);

  let tone: Health["tone"] = "emerald";
  let headline: string;
  if (over) { tone = "rose"; headline = `${over} over budget — drop ${over}`; }
  else if (unassigned.length) { tone = "rose"; headline = `${unassigned.length} marker${unassigned.length > 1 ? "s" : ""} without a channel`; }
  else if (mustFix) { tone = conflicts.length ? "rose" : "amber"; headline = `fits · ${mustFix} to fix`; }
  else if (checks.length) { tone = "amber"; headline = `fits · ${checks.length} worth checking`; }
  else headline = (quiet ? `fits · ${budget - rows.length} channels free` : "fits · balanced") + (customKnown.length ? ` · ${customKnown.length} to order` : "");
  const pageHeadline = blocked ? "The panel does not fit yet" : mustFix ? `${mustFix} thing${mustFix > 1 ? "s" : ""} to fix` : checks.length ? "Panel fits" : "Panel is balanced";
  const pageHint = blocked || mustFix ? null : checks.length ? `${checks.length} worth checking` : "nothing to fix";

  return { budget, over, unassigned, drops, moduleDrops, conflicts, checks, notes, unlikely, accepted, custom, customKnown, pinned, tone, headline, todo, blocked, mustFix, pageHeadline, pageHint };
}

/** Severity band of a spill fraction (received ÷ tolerance), in one place so every colour in the UI means the same thing. */
export type SpillTone = "clean" | "faint" | "watch" | "fix";
export function spillTone(fraction: number): SpillTone {
  return fraction >= SPILL_CRIT ? "fix" : fraction >= SPILL_WARN ? "watch" : fraction >= 0.1 ? "faint" : "clean";
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The SBT kit that supplies both rows on exactly these metals, if any: that pairing has been validated by the vendor. */
function sharedKit(idx: Index, a: PanelRow, b: PanelRow, massA: number | null, massB: number | null): string | null {
  for (const id of a.moduleIds) {
    if (!b.moduleIds.includes(id)) continue;
    const m = idx.modulesById.get(id);
    if (m?.source !== "sbt_kit") continue;
    if (kitSupplies(idx, { ...a, moduleIds: [id] }, massA) && kitSupplies(idx, { ...b, moduleIds: [id] }, massB)) return m.name;
  }
  return null;
}

/**
 * Pairs of targets that a cell-type module puts on opposite sides of a gate (CD19+ CD3−: B cells), keyed both ways.
 * Value = the module that says so. A crude but data-driven proxy for "these two are never co-expressed".
 */
function exclusivePairs(idx: Index, setup: Setup): Map<string, string> {
  const m = new Map<string, string>();
  for (const mod of idx.modulesFor(setup)) {
    const pos = mod.markers.filter((k) => k.target_id && k.polarity !== "neg");
    const neg = mod.markers.filter((k) => k.target_id && k.polarity === "neg");
    for (const p of pos) for (const n of neg) {
      const key = pairKey(p.target_id!, n.target_id!);
      if (!m.has(key)) m.set(key, `${mod.name}: ${p.target_name}+ ${n.target_name}−`);
    }
  }
  return m;
}

function moduleDropCandidates(idx: Index, rows: PanelRow[]): ModuleDrop[] {
  const ids = new Set(rows.flatMap((r) => r.moduleIds));
  return [...ids]
    .map((id) => ({ id, name: idx.modulesById.get(id)?.name ?? id, frees: rows.filter((r) => r.moduleIds.length === 1 && r.moduleIds[0] === id).length }))
    .filter((m) => m.frees > 0)
    .sort((a, b) => b.frees - a.frees || a.name.localeCompare(b.name));
}

/** What to drop first when the panel is too big: what the engine already left out, then loose markers, then the ones costing the most. */
function dropCandidates(idx: Index, setup: Setup, rows: PanelRow[], result: Result, unassigned: PanelRow[], custom: ConjugationIssue[], over: number): DropCandidate[] {
  if (!over && !unassigned.length) return [];
  const rr = byRow(result);
  const customIds = new Set(custom.map((c) => c.rowId));
  const seen = new Set<string>();
  const out: DropCandidate[] = [];
  const push = (row: PanelRow, reason: string, extra: Partial<DropCandidate> = {}) => { if (!seen.has(row.id)) { seen.add(row.id); out.push({ row, reason, ...extra }); } };
  // Not over budget yet still unassigned: the clone is sold on a few metals and they are all taken. Say by whom.
  if (!over) {
    const occupant = new Map<number, string>();
    for (const r of result.rows) if (r.mass != null) occupant.set(r.mass, r.label);
    for (const r of unassigned) {
      const sold = rowMetals(idx, r, setup);
      const who = sold.map((m) => `${m}${idx.instruments.isotopes[String(m)] ?? ""}${occupant.has(m) ? ` (${occupant.get(m)})` : ""}`);
      push(r, who.length ? `${r.clonePinned ? `clone ${r.clone} is` : "its catalogue clones are"} only sold on ${who.join(", ")}` : "no free metal for it", { canGoCustom: !!r.clone });
    }
    return out;
  }
  // Which markers the engine leaves out is only meaningful when the overrun is small; 30 over, it is arbitrary.
  if (over <= 3) for (const r of unassigned) push(r, "no channel left for it");
  const rest = rows.filter((r) => !seen.has(r.id));
  for (const r of rest) if (r.moduleIds.length === 0 && r.custom) push(r, "added by hand · custom conjugation");
  for (const r of rest) if (r.moduleIds.length === 0) push(r, "added by hand, not part of a module");
  for (const r of rest) if (customIds.has(r.id)) push(r, "would be conjugated to order");
  // Then whoever receives the most spill, i.e. the marker the panel is straining hardest to accommodate.
  const spill = (r: PanelRow) => rr.get(r.id)?.receivedOverT ?? 0;
  for (const r of [...rest].sort((a, b) => spill(b) - spill(a))) if (spill(r) >= SPILL_WARN) push(r, `receives ${Math.round(spill(r) * 100)} % of its tolerance in spill`);
  for (const r of [...rest].sort((a, b) => a.moduleIds.length - b.moduleIds.length)) push(r, r.moduleIds.length === 1 ? "in one module" : `in ${r.moduleIds.length} modules`);
  return out.slice(0, Math.min(8, Math.max(over, unassigned.length) + 4));
}

/** Plain-English reading of a spillover warning, with the engine's own sentence kept for the details disclosure. */
export function plainWarning(w: Warning, result: Result): { title: string; action: string | null } {
  const rr = byRow(result).get(w.rowId);
  const top = rr?.contributions[0];
  const pct = rr ? Math.round(rr.receivedOverT * 100) : null;
  switch (w.code) {
    case "spillover":
      return {
        title: rr && top
          ? `${rr.label} (${rr.channel}) gets ${pct} % of the spill it can take, mostly from ${top.label} on ${top.mass}.`
          : w.message,
        action: w.fix ? w.fix.message : top ? `No channel or clone change helps: drop ${top.label} or ${rr!.label}, or accept it.` : null,
      };
    case "dim_bright_channel":
      return { title: `${rr?.label ?? w.rowId} is dim and sits on a weak channel (${rr?.channel}): expect soft separation.`, action: w.fix ? w.fix.message : "Nothing better is free; accept it or drop a bright marker from the sensitive range." };
    case "reserved_lock":
      return { title: w.message, action: "Unpin it and let the optimiser choose." };
    case "duplicate_lock":
      return { title: w.message, action: "Two markers are pinned to one channel: unpin one of them." };
    case "invalid_assignment":
      return { title: w.message, action: "The metal it was given is taken or not one its clone can use: let the optimiser place it." };
    case "flagged_channel":
      return { title: `${rr?.label ?? w.rowId} sits on an EQ bead channel (${rr?.channel}): fine once beads are gated out.`, action: null };
    default:
      return { title: w.message, action: w.fix?.message ?? null };
  }
}

