"use client";
import { useMemo } from "react";
import type { Result } from "@pd3/engine";
import { spillTone } from "@/lib/health";
import { H2, cx } from "./ui";

const HEAT: Record<ReturnType<typeof spillTone>, string> = { fix: "bg-rose-500 text-white", watch: "bg-amber-400", faint: "bg-emerald-200 dark:bg-emerald-800", clean: "bg-emerald-50 dark:bg-emerald-950" };

/** Givers as rows, receivers as columns; every cell is the fraction of the receiver's tolerance. */
export function HeatMap({ result }: { result: Result }) {
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
                <td className="p-0.5 text-slate-600 dark:text-slate-400">{g.channel}</td>
                {rows.map((r) => {
                  const f = cell.get(`${g.rowId}>${r.rowId}`) ?? 0;
                  const bg = f === 0 ? undefined : HEAT[spillTone(f)];
                  return <td key={r.rowId} className={cx("h-5 w-5 border border-slate-100 text-center dark:border-slate-800", bg)} title={`${g.label} → ${r.label}: ${(f * 100).toFixed(0)}% of tolerance`}>{f >= 0.1 ? Math.round(f * 100) : ""}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
