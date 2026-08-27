"use client";
/**
 * The channels nothing sits on, as chips: what is free for the next marker, and one click to keep a channel empty
 * on purpose (a reagent the designer does not model, a radionuclide, a channel the user simply does not want used).
 */
import { useMemo, useState } from "react";
import { antibodyChannel, reservedRoles } from "@/lib/data";
import { useStore } from "@/lib/store";
import { cx } from "./ui";

export function OpenChannels({ compact = false, className }: { compact?: boolean; className?: string }) {
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const rows = useStore((s) => s.rows);
  const result = useStore((s) => s.result);
  const balanced = useStore((s) => s.balanced);
  const toggleBlocked = useStore((s) => s.toggleBlocked);
  const [open, setOpen] = useState(!compact);
  const inst = idx.instrument(setup.instrumentId);

  const { free, blocked } = useMemo(() => {
    const reserved = new Set<number>();
    const roles = reservedRoles(setup);
    for (const r of idx.instruments.reserved[setup.modality]) if (roles.includes(r.role)) for (const m of r.masses) reserved.add(m);
    const taken = new Set<number>();
    if (balanced && result) for (const r of result.rows) if (r.mass != null) taken.add(r.mass);
    for (const r of rows) if (r.locked != null) taken.add(r.locked);
    const pool = inst.channels.filter((c) => antibodyChannel(c, setup) && !reserved.has(c.mass)).sort((a, b) => a.mass - b.mass);
    return {
      free: pool.filter((c) => !setup.blocked.includes(c.mass) && !taken.has(c.mass)),
      blocked: pool.filter((c) => setup.blocked.includes(c.mass)),
    };
  }, [idx, inst, setup, rows, result, balanced]);

  const chip = (c: { mass: number; label: string; rel_sensitivity: number }, isBlocked: boolean) => (
    <button key={c.mass} onClick={() => toggleBlocked(c.mass)} data-testid={isBlocked ? "blocked-chip" : "open-chip"}
      title={isBlocked ? `${c.label} is kept empty on purpose — click to free it` : `${c.label} is open (sensitivity ${c.rel_sensitivity.toFixed(2)}) — click to keep it empty`}
      className={cx("rounded px-1.5 py-0.5 text-[11px] tabular-nums transition",
        isBlocked ? "bg-rose-100 text-rose-800 line-through hover:no-underline dark:bg-rose-900 dark:text-rose-100"
          : "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-300 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-800")}>
      {c.label}
    </button>
  );

  const summary = `${free.length} open channel${free.length === 1 ? "" : "s"}${blocked.length ? ` · ${blocked.length} kept empty` : ""}`;
  return (
    <div className={className} data-testid="open-channels">
      {compact ? (
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="underline decoration-dotted underline-offset-2 hover:text-teal-700 dark:hover:text-teal-300">{summary}</button>
      ) : (
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{summary}<span className="ml-2 text-xs font-normal text-slate-600 dark:text-slate-400">click a channel to keep it empty on purpose</span></div>
      )}
      {open && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {free.map((c) => chip(c, false))}
          {blocked.map((c) => chip(c, true))}
          {free.length === 0 && blocked.length === 0 && <span className="text-xs text-slate-600 dark:text-slate-400">every channel is in use</span>}
        </div>
      )}
    </div>
  );
}
