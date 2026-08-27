"use client";
/**
 * The panel as SBT's application scientists asked to see it: one row per marker with its metal, what spills into it
 * and what it spills onto, both directions named so the user can move the offending metal rather than the victim.
 * Detail lives in the hover title; the status column says whether anything needs doing.
 */
import { useMemo, useState } from "react";
import { SPILL_CRIT, SPILL_WARN, type Contribution, type Result } from "@pd3/engine";
import type { Health } from "@/lib/health";
import { useStore } from "@/lib/store";
import { Pill, cx } from "./ui";

const MECH: Record<string, string> = { isotope: "isotopic impurity", oxide: "oxide (+16)", adjacent: "±1 mass neighbour", other: "other" };
const mech = (m: string) => MECH[m] ?? m;
type Sort = "spill_in" | "spill_out" | "mass" | "name";

export function SpillTable({ result, health }: { result: Result; health: Health }) {
  const rows = useStore((s) => s.rows);
  const [sort, setSort] = useState<Sort>("spill_in");
  const status = useMemo(() => {
    const m = new Map<string, { tone: "rose" | "amber" | "emerald" | "slate" | "violet"; label: string; note?: string }>();
    for (const w of health.conflicts) if (w.code === "spillover") m.set(w.rowId, { tone: "rose", label: "must fix" });
    for (const w of health.checks) if (w.code === "spillover" && !m.has(w.rowId)) m.set(w.rowId, { tone: "amber", label: "worth checking" });
    for (const { w, why } of health.unlikely) if (!m.has(w.rowId)) m.set(w.rowId, { tone: "slate", label: why.includes("validated") ? "validated in kit" : "unlikely to matter", note: why });
    for (const { w, reason } of health.accepted) if (!m.has(w.rowId)) m.set(w.rowId, { tone: "slate", label: "accepted", note: reason });
    for (const c of health.custom) if (!m.has(c.rowId)) m.set(c.rowId, { tone: "violet", label: "metal not sold", note: c.message });
    for (const c of health.customKnown) if (!m.has(c.rowId)) m.set(c.rowId, { tone: "violet", label: "to order", note: c.message });
    for (const r of health.unassigned) m.set(r.id, { tone: "rose", label: "no channel" });
    return m;
  }, [health]);
  const nameOf = (id: string) => rows.find((r) => r.id === id)?.name ?? id;
  const sorted = useMemo(() => {
    const out = [...result.rows];
    const outMax = (r: Result["rows"][number]) => r.given[0]?.fraction ?? 0;
    const cmp: Record<Sort, (a: Result["rows"][number], b: Result["rows"][number]) => number> = {
      spill_in: (a, b) => b.receivedOverT - a.receivedOverT || (a.mass ?? 999) - (b.mass ?? 999),
      spill_out: (a, b) => outMax(b) - outMax(a) || (a.mass ?? 999) - (b.mass ?? 999),
      mass: (a, b) => (a.mass ?? 999) - (b.mass ?? 999),
      name: (a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }),
    };
    return out.sort(cmp[sort]);
  }, [result, sort]);

  const pct = (f: number) => `${Math.round(f * 100)} %`;
  const tone = (f: number) => (f >= SPILL_CRIT ? "text-rose-700 dark:text-rose-300 font-semibold" : f >= SPILL_WARN ? "text-amber-700 dark:text-amber-300 font-medium" : f >= 0.25 ? "text-slate-700 dark:text-slate-200" : "text-slate-500 dark:text-slate-400");
  /** In: the total this marker receives, naming the main sender. Out: the worst thing this marker does to a neighbour. */
  const cell = (c: Contribution | undefined, dir: "in" | "out", total?: number) => {
    const f = dir === "in" ? (total ?? 0) : (c?.fraction ?? 0);
    if (!c || f < 0.02) return <span className="text-slate-400 dark:text-slate-500">—</span>;
    return (
      <span className={tone(f)} title={dir === "in" ? `${c.label} (${c.mass}) sends ${c.so.toFixed(1)} counts here by ${mech(c.mechanism)}: ${pct(c.fraction)} of what this marker can take` : `spills ${pct(c.fraction)} of ${c.label}'s tolerance at ${c.mass} by ${mech(c.mechanism)}`}>
        {pct(f)} <span className="font-normal text-slate-600 dark:text-slate-400">{dir === "in" ? (c.fraction < f - 0.005 ? "mostly from" : "from") : "onto"} {c.label} ({c.mass})</span>
      </span>
    );
  };
  const th = (k: Sort, label: string, hint: string) => (
    <th className="px-2 py-1.5 text-left font-medium">
      <button onClick={() => setSort(k)} title={hint} className={cx("underline decoration-dotted underline-offset-2", sort === k && "text-teal-700 dark:text-teal-300")}>{label}{sort === k ? " ▾" : ""}</button>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700" data-testid="spill-table">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="bg-slate-50 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <tr>
            {th("name", "Marker", "sort by name")}
            {th("mass", "Metal", "sort by mass")}
            {th("spill_in", "Spill in", "what lands on this marker, as a share of the spill it can take; sort by worst")}
            {th("spill_out", "Spill out", "what this marker sends onto its worst neighbour; sort by worst")}
            <th className="px-2 py-1.5 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {sorted.map((r) => {
            const st = status.get(r.rowId);
            const title = [r.reasons.length ? r.reasons.join("\n") : "", r.contributions.length > 1 ? `also from: ${r.contributions.slice(1, 4).map((c) => `${c.label} ${pct(c.fraction)}`).join(", ")}` : "", st?.note ?? ""].filter(Boolean).join("\n");
            return (
              <tr key={r.rowId} title={title || undefined} data-testid="spill-row">
                <td className="px-2 py-1 font-medium">{nameOf(r.rowId)}</td>
                <td className="px-2 py-1 tabular-nums">{r.channel ?? <span className="text-rose-700 dark:text-rose-300">none</span>}{r.locked ? <span className="ml-1 text-xs" title="pinned">🔒</span> : ""}</td>
                <td className="px-2 py-1 tabular-nums">{cell(r.contributions[0], "in", r.receivedOverT)}</td>
                <td className="px-2 py-1 tabular-nums">{cell(r.given[0], "out")}</td>
                <td className="px-2 py-1">{st ? <Pill tone={st.tone} title={st.note}>{st.label}</Pill> : <span className="text-xs text-emerald-800 dark:text-emerald-300">clean</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
