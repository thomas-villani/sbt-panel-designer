"use client";
/** The channel count, with its working shown: antibody channels plus scaffolding, minus every reservation. */
import { useLayoutEffect, useRef, useState } from "react";
import { Popover } from "./Overlay";
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
  // Open upward by default; flip below the trigger when the card would run off the top of the viewport.
  const ref = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current?.parentElement;
    if (el) setFlip(el.getBoundingClientRect().top < 8);
  }, []);
  const b = useBudgetDetail()!;
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const iso = (m: number) => `${m}${idx.instruments.isotopes[String(m)] ?? ""}`;
  const rows: { n: number; label: string; masses: number[] }[] = [
    ...b.lines.map((l) => ({ n: l.masses.length, label: l.label, masses: l.masses })),
    ...(b.blocked.length ? [{ n: b.blocked.length, label: "Kept empty on purpose", masses: b.blocked }] : []),
  ];
  return (
    <Popover label={`${b.instrument} channel budget`} onClose={onClose} testId="budget-card" className={cx("right-0 w-[22rem] max-w-[85vw] p-3 text-xs", flip ? "top-full mt-2" : "bottom-full mb-2")}>
    <div ref={ref}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="font-semibold">{b.instrument} channel budget</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="close">×</button>
      </div>
      <table className="w-full">
        <tbody>
          <tr className="border-b border-slate-100 dark:border-slate-800">
            <td className="py-1 pr-2 text-right font-mono">{b.total}</td>
            <td className="py-1">channels<div className="text-slate-600 dark:text-slate-400">{b.antibody} metals SBT offers for conjugation{b.total > b.antibody ? ` + ${b.total - b.antibody} Cell-ID-only (Ir, Pd)` : ""}</div></td>
          </tr>
          {rows.map((l) => (
            <tr key={l.label} className="border-b border-slate-100 dark:border-slate-800">
              <td className="py-1 pr-2 text-right font-mono text-rose-700 dark:text-rose-300">−{l.n}</td>
              <td className="py-1">{l.label}
                <div className="text-slate-600 dark:text-slate-400">{l.masses.map(iso).join(", ")}</div>
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
        <p className="mt-2 border-t border-slate-100 pt-2 text-slate-600 dark:text-slate-400 dark:border-slate-800">
          <b>Why not 45?</b> A Hyperion also detects 157Gd, 194Pt and 197Au, but SBT offers no IMC conjugation metal for
          them, and Pt on IMC performs poorly for antibodies: it is kept for the cell segmentation kit. Not running the
          kit? Turn it off in Setup and its three Pt channels come back.
        </p>
      )}
      <p className="mt-2 text-slate-600 dark:text-slate-400">Cell ID & controls: {reservedRoles(setup).length} role{reservedRoles(setup).length === 1 ? "" : "s"} · change them in Setup.</p>
    </div>
    </Popover>
  );
}
