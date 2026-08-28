"use client";
/**
 * Horizontal channel strip 89 → 209: height = relative sensitivity, colour = received SO / tolerance of the occupant.
 * Colour never carries the meaning alone: a "!" marks must-fix bars, "~" worth-checking ones, hatching reserved /
 * kept-empty channels; every bar has an accessible name, and open channels are real buttons (Enter / Space keep them empty).
 */
import { useMemo } from "react";
import type { InstrumentDef, Result } from "@pd3/engine";
import { antibodyChannel, reservedChannels } from "@/lib/data";
import { SPILL_CRIT, SPILL_WARN } from "@pd3/engine";
import { spillTone, type SpillTone } from "@/lib/health";
import { useStore } from "@/lib/store";
import { cx } from "./ui";

const TONE: Record<SpillTone, string> = { clean: "bg-emerald-500", faint: "bg-emerald-500", watch: "bg-amber-400", fix: "bg-rose-500" };
const MARK: Record<SpillTone, string> = { clean: "", faint: "", watch: "~", fix: "!" };
const HATCH = "bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(0,0,0,.15)_3px,rgba(0,0,0,.15)_6px)]";
const WAIVED = "bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,.35)_3px,rgba(255,255,255,.35)_6px)]";

export function MassStrip({ instrument, result, waived }: { instrument: InstrumentDef; result: Result | null; waived?: Set<string> }) {
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const toggleBlocked = useStore((s) => s.toggleBlocked);
  const reserved = useMemo(() => {
    const m = reservedChannels(idx, setup);
    for (const mass of setup.blocked) m.set(mass, "kept empty on purpose");
    return m;
  }, [idx, setup]);
  const occupant = useMemo(() => new Map(result?.rows.filter((r) => r.mass != null).map((r) => [r.mass!, r]) ?? []), [result]);
  const channels = instrument.channels.filter((c) => antibodyChannel(c, setup) || reserved.has(c.mass)).sort((a, b) => a.mass - b.mass);

  return (
    <div>
      {/* On phones the strip keeps a readable width and scrolls sideways inside its own box. */}
      <div className="overflow-x-auto" data-testid="mass-strip">
        <div className="flex h-24 min-w-[640px] items-end gap-px pb-1 sm:min-w-0" role="group" aria-label="Channels, low to high mass">
          {channels.map((c) => {
            const occ = occupant.get(c.mass);
            const res = reserved.get(c.mass);
            const blocked = setup.blocked.includes(c.mass);
            const isWaived = !!occ && !!waived?.has(occ.rowId);
            const tone: SpillTone | null = occ ? spillTone(occ.receivedOverT) : null;
            const h = Math.max(18, Math.round(c.rel_sensitivity * 80));
            const bar = res ? cx("bg-slate-300 dark:bg-slate-600", HATCH)
              : !occ ? "bg-slate-100 dark:bg-slate-800"
                : isWaived ? cx("bg-emerald-500", WAIVED)
                  : TONE[tone!];
            const mark = occ && !isWaived ? MARK[tone!] : "";
            const name = res ? `${c.label}: reserved, ${res}${blocked ? " (press to free it)" : ""}`
              : occ ? `${c.label}: ${occ.label}, receives ${occ.received.toFixed(1)} counts (${occ.receivedOverT.toFixed(2)} × tolerance)${isWaived ? "; accepted or validated, not counted against the panel" : tone === "fix" ? "; must fix" : tone === "watch" ? "; worth checking" : ""}; sensitivity ${c.rel_sensitivity.toFixed(2)}`
                : `${c.label}: open, sensitivity ${c.rel_sensitivity.toFixed(2)} (press to keep it empty)`;
            const clickable = !occ && (!res || blocked);
            const inner = (
              <>
                <span className={cx("flex w-full items-start justify-center rounded-t-sm text-[9px] font-bold leading-none text-white transition-all", bar)} style={{ height: h }} aria-hidden>{mark}</span>
                <span className="mt-0.5 text-[8px] leading-none text-slate-600 dark:text-slate-400" aria-hidden>{c.mass % 5 === 0 || c.mass === 89 ? c.mass : " "}</span>
              </>
            );
            const cls = "flex min-w-0 flex-1 flex-col items-center justify-end rounded-sm";
            return clickable
              ? <button key={c.mass} type="button" className={cx(cls, "cursor-pointer")} title={name} aria-label={name} aria-pressed={blocked} onClick={() => toggleBlocked(c.mass)} data-mass={c.mass}>{inner}</button>
              : <span key={c.mass} role="img" className={cls} title={name} aria-label={name} data-mass={c.mass}>{inner}</span>;
          })}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-600 dark:text-slate-400" aria-hidden>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />clean (spill under {SPILL_WARN} × tolerance)</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-400 text-center text-[8px] font-bold not-italic leading-[10px] text-white">~</i>worth checking ({SPILL_WARN}–{SPILL_CRIT} ×)</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-rose-500 text-center text-[8px] font-bold not-italic leading-[10px] text-white">!</i>must fix (over {SPILL_CRIT} ×)</span>
        <span><i className={cx("mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-slate-300", HATCH)} />reserved / kept empty</span>
        <span>bar height = channel sensitivity</span>
      </div>
    </div>
  );
}
