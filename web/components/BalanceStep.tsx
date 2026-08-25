"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { MassStrip } from "./MassStrip";
import { Button, H2, Pill, cx } from "./ui";

export function BalanceStep() {
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const rows = useStore((s) => s.rows);
  const result = useStore((s) => s.result);
  const balanced = useStore((s) => s.balanced);
  const balancing = useStore((s) => s.balancing);
  const engineError = useStore((s) => s.engineError);
  const balanceNow = useStore((s) => s.balanceNow);
  const applyFix = useStore((s) => s.applyFix);
  const lockRow = useStore((s) => s.lockRow);
  const removeRow = useStore((s) => s.removeRow);
  const setStep = useStore((s) => s.setStep);
  const [showHeat, setShowHeat] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const instrument = idx.instrument(setup.instrumentId);
  const locks = rows.filter((r) => r.locked != null).length;

  if (!balanced) {
    return (
      <div className="flex flex-col items-start gap-4">
        <H2>Balance the panel</H2>
        <p className="max-w-prose text-sm text-slate-600 dark:text-slate-300">
          The optimiser assigns a metal to each of your {rows.length} markers so that bright markers do not spill into dim ones,
          using the {instrument.name} overlap matrix and sensitivity curve. Metals appear only after this step.
        </p>
        <Button variant="primary" size="lg" onClick={() => void balanceNow()} disabled={!rows.length || balancing}>{balancing ? "Balancing…" : "Balance panel"}</Button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="space-y-6">
        <H2>Balance</H2>
        {engineError ? <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">Engine error: {engineError}</div> : <div className="text-sm text-slate-500">Balancing…</div>}
      </div>
    );
  }
  const warnings = result.warnings;
  const serious = warnings.filter((w) => w.severity !== "info");

  return (
    <div className="space-y-6">
      <section>
        <H2 hint={result ? `${result.stats.ms.toFixed(0)} ms · re-runs on every change` : undefined}>
          <span className="flex items-center gap-2">Balance{balancing && <span className="text-xs font-normal text-slate-500">updating…</span>}</span>
        </H2>
        {engineError && <div className="mb-3 rounded-md bg-rose-50 p-3 text-sm text-rose-800">Engine error: {engineError}</div>}
        <MassStrip instrument={instrument} result={result} />
      </section>

      <section>
        <H2 hint={serious.length ? undefined : "nothing to fix"}>
          {serious.length ? `${serious.length} thing${serious.length > 1 ? "s" : ""} to look at` : "Panel is balanced"}
        </H2>
        <ul className="space-y-2">
          {warnings.map((w, i) => (
            <li key={i} className={cx("flex items-start gap-3 rounded-lg border p-3 text-sm", w.severity === "critical" ? "border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950" : w.severity === "warning" ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800")}>
              <Pill tone={w.severity === "critical" ? "rose" : w.severity === "warning" ? "amber" : "slate"}>{w.severity}</Pill>
              <div className="flex-1">
                <div>{w.message}</div>
                {w.fix && <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{w.fix.message} (score {w.fix.delta.toFixed(2)})</div>}
              </div>
              <div className="flex shrink-0 gap-1">
                {w.fix && <Button size="sm" variant="primary" onClick={() => applyFix(w.fix!)}>Apply</Button>}
                {w.code === "unassigned" && <Button size="sm" variant="danger" onClick={() => removeRow(w.rowId)}>Remove</Button>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-wrap items-center gap-2 text-sm">
        {locks > 0 && <Button size="sm" onClick={() => rows.forEach((r) => r.locked != null && lockRow(r.id, null))}>Unlock all ({locks})</Button>}
        <Button size="sm" onClick={() => setShowHeat(!showHeat)}>{showHeat ? "Hide" : "Show"} overlap map</Button>
        <Button size="sm" variant="ghost" onClick={() => setShowWhy(!showWhy)}>Why metals matter</Button>
        <span className="flex-1" />
        <Button variant="primary" onClick={() => setStep("order")} disabled={!result || result.unassigned.length > 0}>Order / export →</Button>
      </section>

      {showWhy && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed dark:border-slate-700 dark:bg-slate-900">
          <p><b>Sensitivity.</b> The mass cytometer detects some isotopes better than others: channels 153–176 are the sweet spot, 89Y and 141–152 are less sensitive, and the heavy end (&gt; 176) sits in between. Put dim markers (few molecules per cell) on sensitive channels and bright markers where sensitivity is poor.</p>
          <p className="mt-2"><b>Spillover.</b> A fraction of each metal's signal leaks into neighbouring channels: M±1 from isotopic impurity, M+16 when the metal forms an oxide, and the same element's other isotopes. The overlap matrix says how much (in %). A bright marker on 141Pr sends about 2–3 % of its signal to 157Gd, which drowns a dim marker sitting there.</p>
          <p className="mt-2"><b>What the score means.</b> For each marker we add up the counts it receives from every other marker and divide by its tolerance (how much noise it can take before populations blur). Sum over markers = the score; lower is better. A warning appears when a marker receives more than half its tolerance, critical above 1×.</p>
        </section>
      )}

      {showHeat && result && <HeatMap />}
    </div>
  );
}

function HeatMap() {
  const result = useStore((s) => s.result)!;
  const rows = useMemo(() => result.rows.filter((r) => r.mass != null).sort((a, b) => a.mass! - b.mass!), [result]);
  const cell = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) for (const c of r.contributions) m.set(`${c.rowId}>${r.rowId}`, c.fraction);
    return m;
  }, [rows]);
  return (
    <section>
      <H2 hint="rows give, columns receive; cell = fraction of the receiver's tolerance">Overlap map</H2>
      <div className="overflow-x-auto">
        <table className="text-[10px]">
          <thead><tr><th className="p-0.5" /><th className="p-0.5" />{rows.map((r) => <th key={r.rowId} className="h-28 w-5 p-0 align-bottom font-normal"><div className="mx-auto h-28 w-5 whitespace-nowrap text-left leading-5" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>{r.label}</div></th>)}</tr></thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.rowId}>
                <td className="whitespace-nowrap p-0.5 text-right">{g.label}</td>
                <td className="p-0.5 text-slate-500">{g.channel}</td>
                {rows.map((r) => {
                  const f = cell.get(`${g.rowId}>${r.rowId}`) ?? 0;
                  const bg = f === 0 ? undefined : f >= 1 ? "#f43f5e" : f >= 0.5 ? "#fbbf24" : f >= 0.1 ? "#a7f3d0" : "#ecfdf5";
                  return <td key={r.rowId} className="h-5 w-5 border border-slate-100 text-center dark:border-slate-800" style={{ background: bg }} title={`${g.label} → ${r.label}: ${(f * 100).toFixed(0)}% of tolerance`}>{f >= 0.1 ? Math.round(f * 100) : ""}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
