"use client";
/** The channel count, with its working shown: antibody channels plus scaffolding, minus every reservation. */
import { useState } from "react";
import { channelBudgetDetail, reservedRoles } from "@/lib/data";
import { useStore } from "@/lib/store";
import { cx } from "./ui";

export function useBudgetDetail() {
  const idx = useStore((s) => s.idx);
  const setup = useStore((s) => s.setup);
  return idx ? channelBudgetDetail(idx, setup) : null;
}

/** "27 of ~41 channels" — click for the breakdown. */
export function ChannelCount({ used, className }: { used: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const b = useBudgetDetail();
  if (!b) return null;
  return (
    <span className={cx("relative inline-block", className)}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="channel-count"
        className="underline decoration-dotted underline-offset-2 hover:text-teal-700 dark:hover:text-teal-300">
        {used} of ~{b.available} channels
      </button>
      {open && <BudgetCard onClose={() => setOpen(false)} />}
    </span>
  );
}

function BudgetCard({ onClose }: { onClose: () => void }) {
  const b = useBudgetDetail()!;
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const iso = (m: number) => `${m}${idx.instruments.isotopes[String(m)] ?? ""}`;
  const rows: { n: number; label: string; masses: number[] }[] = [
    ...b.lines.map((l) => ({ n: l.masses.length, label: l.label, masses: l.masses })),
    ...(b.blocked.length ? [{ n: b.blocked.length, label: "Kept empty on purpose", masses: b.blocked }] : []),
  ];
  return (
    <div className="absolute bottom-full right-0 z-30 mb-2 w-[22rem] max-w-[85vw] rounded-lg border border-slate-200 bg-white p-3 text-left text-xs shadow-xl dark:border-slate-600 dark:bg-slate-900" data-testid="budget-card">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="font-semibold">{b.instrument} channel budget</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="close">×</button>
      </div>
      <table className="w-full">
        <tbody>
          <tr className="border-b border-slate-100 dark:border-slate-800">
            <td className="py-1 pr-2 text-right font-mono">{b.total}</td>
            <td className="py-1">channels<div className="text-slate-500">{b.antibody} metals SBT offers for conjugation{b.total > b.antibody ? ` + ${b.total - b.antibody} scaffolding-only (Ir, Pd)` : ""}</div></td>
          </tr>
          {rows.map((l) => (
            <tr key={l.label} className="border-b border-slate-100 dark:border-slate-800">
              <td className="py-1 pr-2 text-right font-mono text-rose-700 dark:text-rose-300">−{l.n}</td>
              <td className="py-1">{l.label}
                <div className="text-slate-500">{l.masses.map(iso).join(", ")}</div>
              </td>
            </tr>
          ))}
          <tr>
            <td className="py-1 pr-2 text-right font-mono font-semibold">{b.available}</td>
            <td className="py-1 font-semibold">left for antibodies</td>
          </tr>
        </tbody>
      </table>
      {setup.modality === "imaging" && (
        <p className="mt-2 border-t border-slate-100 pt-2 text-slate-500 dark:border-slate-800">
          <b>Why not 45?</b> A Hyperion also detects 157Gd, 194Pt and 197Au, but SBT offers no IMC conjugation metal for
          them, and Pt on IMC performs poorly for antibodies: it is kept for the cell segmentation kit. Not running the
          kit? Turn it off in Setup and its three Pt channels come back.
        </p>
      )}
      <p className="mt-2 text-slate-500">Scaffolding reservations: {reservedRoles(setup).length} role{reservedRoles(setup).length === 1 ? "" : "s"} · change them in Setup.</p>
    </div>
  );
}
