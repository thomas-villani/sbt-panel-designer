"use client";
import { useMemo, useState } from "react";
import { LEVELS, LEVEL_LABEL, type CloneOption } from "@/lib/data";
import { useStore, useBudget } from "@/lib/store";
import type { PanelRow } from "@/lib/types";
import { Button, Pill, cx } from "./ui";

const LEVEL_TONE = { low: "amber", medium: "slate", high: "teal", very_high: "emerald" } as const;

export function PanelSidebar() {
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const rows = useStore((s) => s.rows);
  const result = useStore((s) => s.result);
  const balanced = useStore((s) => s.balanced);
  const balancing = useStore((s) => s.balancing);
  const removeRow = useStore((s) => s.removeRow);
  const setLevel = useStore((s) => s.setLevel);
  const setClone = useStore((s) => s.setClone);
  const lockRow = useStore((s) => s.lockRow);
  const clearPanel = useStore((s) => s.clearPanel);
  const budget = useBudget();
  const [open, setOpen] = useState<string | null>(null);

  const modules = useMemo(() => new Set(rows.flatMap((r) => r.moduleIds)), [rows]);
  const byRow = useMemo(() => new Map(result?.rows.map((r) => [r.rowId, r]) ?? []), [result]);
  const nWarn = result?.warnings.filter((w) => w.severity !== "info").length ?? 0;
  const channels = idx.instrument(setup.instrumentId).channels;

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <div className="text-sm font-semibold">Your panel</div>
        {rows.length > 0 && <Button size="sm" variant="ghost" onClick={clearPanel}>Clear</Button>}
      </div>
      <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto text-sm dark:divide-slate-800">
        {rows.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-500">Add modules or search for markers.</li>}
        {rows.map((r) => {
          const rr = byRow.get(r.id);
          const opts = r.targetId ? idx.cloneOptions(r.targetId, setup) : [];
          const showMetal = balanced && rr;
          const sev = rr ? (rr.receivedOverT >= 1 ? "rose" : rr.receivedOverT >= 0.5 ? "amber" : "emerald") : "slate";
          return (
            <li key={r.id} className="px-3 py-1.5">
              <div className="flex items-center gap-2">
                <button className="min-w-0 flex-1 truncate text-left font-medium" onClick={() => setOpen(open === r.id ? null : r.id)} title={r.clone ? `clone ${r.clone}` : "custom conjugation"}>{r.name}</button>
                <Pill tone={LEVEL_TONE[r.level]} onClick={() => setLevel(r.id, LEVELS[(LEVELS.indexOf(r.level) + 1) % LEVELS.length])} title="abundance: click to cycle">{LEVEL_LABEL[r.level]}</Pill>
                {showMetal && (
                  rr.mass != null
                    ? <Pill tone={sev} title={`received ${rr.received.toFixed(1)} counts = ${rr.receivedOverT.toFixed(2)} × tolerance`} onClick={() => setOpen(open === r.id ? null : r.id)}>{r.locked != null ? "🔒 " : ""}{rr.channel}</Pill>
                    : <Pill tone="rose">no channel</Pill>
                )}
                {!showMetal && r.custom && <Pill tone="violet" title="no catalogue conjugate for this setup: custom conjugation">custom</Pill>}
                <button onClick={() => removeRow(r.id)} className="text-slate-400 hover:text-rose-600" title="remove">×</button>
              </div>
              {open === r.id && (
                <RowDetails row={r} clones={opts} channels={channels} rr={rr} balanced={balanced}
                  onClone={(c) => setClone(r.id, c)} onLock={(m) => lockRow(r.id, m)} />
              )}
            </li>
          );
        })}
      </ul>
      <div className="space-y-1 border-t border-slate-200 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
        <div><b>{rows.length}</b> of ~{budget} channels · <b>{modules.size}</b> module{modules.size === 1 ? "" : "s"}</div>
        {balanced && result && (
          <div className={cx(nWarn ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300")}>
            {balancing ? "balancing…" : nWarn ? `${nWarn} warning${nWarn > 1 ? "s" : ""} to resolve` : "no warnings — panel is balanced"}
            {result.unassigned.length > 0 && ` · ${result.unassigned.length} unassigned`}
          </div>
        )}
        {balanced && result && <div className="text-slate-400">spillover score {result.objective.toFixed(2)} (lower is better)</div>}
      </div>
    </div>
  );
}

function RowDetails({ row, clones, channels, rr, balanced, onClone, onLock }: {
  row: PanelRow; clones: CloneOption[];
  channels: { mass: number; label: string; usable: boolean }[]; rr: { mass: number | null; reasons: string[]; contributions: { label: string; mass: number; fraction: number; mechanism: string }[] } | undefined;
  balanced: boolean; onClone: (c: string | null) => void; onLock: (m: number | null) => void;
}) {
  const allowed = new Set(clones.find((c) => c.clone === row.clone)?.conjugates.map((c) => c.mass) ?? []);
  return (
    <div className="mt-1 space-y-2 rounded-md bg-slate-50 p-2 text-xs dark:bg-slate-800">
      {clones.length > 1 && (
        <label className="flex items-center gap-2">
          <span className="text-slate-500">Clone</span>
          <select value={row.clone ?? ""} onChange={(e) => onClone(e.target.value || null)} className="rounded border border-slate-300 bg-white px-1 py-0.5 dark:border-slate-600 dark:bg-slate-900">
            {clones.map((c) => <option key={c.clone} value={c.clone}>{c.clone} · {c.metals.length} metal{c.metals.length > 1 ? "s" : ""}{c.sampleValidated ? " · validated" : ""} · {c.reactivity.join("/")}</option>)}
            <option value="">custom conjugation</option>
          </select>
        </label>
      )}
      {clones.length === 1 && <div className="text-slate-500">Clone {clones[0].clone} · {clones[0].reactivity.join("/")} · {clones[0].tds && <a className="underline" href={clones[0].tds} target="_blank" rel="noreferrer">TDS</a>}</div>}
      {clones.length === 0 && <div className="text-violet-700 dark:text-violet-300">No catalogue conjugate for this species/application: custom conjugation with the Maxpar X8 kit (any lanthanide{row.custom ? "" : ""}).</div>}
      {balanced && rr && (
        <label className="flex items-center gap-2">
          <span className="text-slate-500">Channel</span>
          <select value={row.locked ?? ""} onChange={(e) => onLock(e.target.value ? Number(e.target.value) : null)} className="rounded border border-slate-300 bg-white px-1 py-0.5 dark:border-slate-600 dark:bg-slate-900">
            <option value="">let the optimiser choose{rr.mass != null ? ` (${channels.find((c) => c.mass === rr.mass)?.label})` : ""}</option>
            {channels.filter((c) => c.usable && (allowed.size === 0 || allowed.has(c.mass))).map((c) => <option key={c.mass} value={c.mass}>lock to {c.label}</option>)}
          </select>
        </label>
      )}
      {balanced && rr && rr.reasons.length > 0 && <ul className="list-disc space-y-0.5 pl-4 text-slate-600 dark:text-slate-300">{rr.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      {balanced && rr && rr.contributions.length > 0 && (
        <div className="text-slate-500">Receives from: {rr.contributions.slice(0, 4).map((c) => `${c.label} (${c.mass}, ${c.mechanism}, ${(c.fraction * 100).toFixed(0)}% of tolerance)`).join("; ")}</div>
      )}
    </div>
  );
}
