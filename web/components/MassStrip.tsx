"use client";
/** Horizontal channel strip 89 → 209: height = relative sensitivity, colour = received SO / tolerance of the occupant. */
import { useMemo } from "react";
import { SPILL_CRIT, SPILL_WARN, type Result } from "@pd3/engine";
import type { InstrumentDef } from "@pd3/engine";
import { antibodyChannel, reservedChannels } from "@/lib/data";
import { useStore } from "@/lib/store";
import { cx } from "./ui";

export function MassStrip({ instrument, result, waived }: { instrument: InstrumentDef; result: Result | null; waived?: Set<string> }) {
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const toggleBlocked = useStore((s) => s.toggleBlocked);
  const reserved = useMemo(() => {
    const m = reservedChannels(idx, setup);
    for (const mass of setup.blocked) m.set(mass, "kept empty on purpose — click to free it");
    return m;
  }, [idx, setup]);
  const occupant = useMemo(() => new Map(result?.rows.filter((r) => r.mass != null).map((r) => [r.mass!, r]) ?? []), [result]);
  const channels = instrument.channels.filter((c) => antibodyChannel(c, setup) || reserved.has(c.mass)).sort((a, b) => a.mass - b.mass);

  return (
    <div>
      {/* On phones the strip keeps a readable width and scrolls sideways inside its own box. */}
      <div className="overflow-x-auto" data-testid="mass-strip">
      <div className="flex h-24 min-w-[640px] items-end gap-px pb-1 sm:min-w-0">
        {channels.map((c) => {
          const occ = occupant.get(c.mass);
          const res = reserved.get(c.mass);
          const h = Math.max(18, Math.round(c.rel_sensitivity * 80));
          const tone = res ? "bg-slate-300 dark:bg-slate-600 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(0,0,0,.15)_3px,rgba(0,0,0,.15)_6px)]"
            : !occ ? "bg-slate-100 dark:bg-slate-800"
              : waived?.has(occ.rowId) ? "bg-emerald-500 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,.35)_3px,rgba(255,255,255,.35)_6px)]"
              : occ.receivedOverT >= SPILL_CRIT ? "bg-rose-500" : occ.receivedOverT >= SPILL_WARN ? "bg-amber-400" : "bg-emerald-500";
          const title = res ? `${c.label}: reserved for ${res}`
            : occ ? `${c.label}: ${occ.label} — receives ${occ.received.toFixed(1)} counts (${occ.receivedOverT.toFixed(2)} × tolerance)${waived?.has(occ.rowId) ? "; accepted or validated, so not counted against the panel" : ""}; sensitivity ${c.rel_sensitivity.toFixed(2)}`
              : `${c.label}: open; sensitivity ${c.rel_sensitivity.toFixed(2)} — click to keep it empty`;
          const clickable = !occ && (!res || setup.blocked.includes(c.mass));
          return (
            <div key={c.mass} className={cx("flex min-w-0 flex-1 flex-col items-center justify-end", clickable && "cursor-pointer")} title={title} onClick={clickable ? () => toggleBlocked(c.mass) : undefined}>
              <div className={cx("w-full rounded-t-sm transition-all", tone)} style={{ height: h }} />
              <div className="mt-0.5 text-[8px] leading-none text-slate-600 dark:text-slate-400">{c.mass % 5 === 0 || c.mass === 89 ? c.mass : " "}</div>
            </div>
          );
        })}
      </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-600 dark:text-slate-400">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />clean (spill under {SPILL_WARN} × tolerance)</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" />worth checking ({SPILL_WARN}–{SPILL_CRIT} ×)</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-rose-500" />must fix (over {SPILL_CRIT} ×)</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-slate-300" />reserved / kept empty</span>
        <span>bar height = channel sensitivity</span>
      </div>
    </div>
  );
}
