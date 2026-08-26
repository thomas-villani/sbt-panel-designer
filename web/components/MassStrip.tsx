"use client";
/** Horizontal channel strip 89 → 209: height = relative sensitivity, colour = received SO / tolerance of the occupant. */
import { useMemo } from "react";
import type { Result } from "@pd3/engine";
import type { InstrumentDef } from "@pd3/engine";
import { antibodyChannel, reservedRoles } from "@/lib/data";
import { useStore } from "@/lib/store";
import { cx } from "./ui";

export function MassStrip({ instrument, result }: { instrument: InstrumentDef; result: Result | null }) {
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const reserved = useMemo(() => {
    const roles = reservedRoles(setup);
    const m = new Map<number, string>();
    for (const r of idx.instruments.reserved[setup.modality]) if (roles.includes(r.role)) for (const mass of r.masses) m.set(mass, r.label);
    for (const mass of setup.blocked) m.set(mass, "a channel you asked to keep empty");
    return m;
  }, [idx, setup]);
  const occupant = useMemo(() => new Map(result?.rows.filter((r) => r.mass != null).map((r) => [r.mass!, r]) ?? []), [result]);
  const channels = instrument.channels.filter((c) => antibodyChannel(c) || reserved.has(c.mass)).sort((a, b) => a.mass - b.mass);

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
              : occ.receivedOverT >= 1 ? "bg-rose-500" : occ.receivedOverT >= 0.5 ? "bg-amber-400" : "bg-emerald-500";
          const title = res ? `${c.label}: reserved for ${res}`
            : occ ? `${c.label}: ${occ.label} — receives ${occ.received.toFixed(1)} counts (${occ.receivedOverT.toFixed(2)} × tolerance); sensitivity ${c.rel_sensitivity.toFixed(2)}`
              : `${c.label}: free; sensitivity ${c.rel_sensitivity.toFixed(2)}`;
          return (
            <div key={c.mass} className="flex min-w-0 flex-1 flex-col items-center justify-end" title={title}>
              <div className={cx("w-full rounded-t-sm transition-all", tone)} style={{ height: h }} />
              <div className="mt-0.5 text-[8px] leading-none text-slate-500">{c.mass % 5 === 0 || c.mass === 89 ? c.mass : " "}</div>
            </div>
          );
        })}
      </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-500">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />clean (&lt; 0.5 × tolerance)</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" />watch (0.5–1 ×)</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-rose-500" />spillover exceeds tolerance</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-slate-300" />reserved / kept empty</span>
        <span>bar height = channel sensitivity</span>
      </div>
    </div>
  );
}
