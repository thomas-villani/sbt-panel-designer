"use client";
import { useState } from "react";
import { SAMPLE_TYPES, SPECIES, reservedRoles } from "@/lib/data";
import { useStore } from "@/lib/store";
import { useBudgetDetail } from "./ChannelBudget";
import { Button, H2, Tile, cx } from "./ui";

export function SetupStep() {
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const setSetup = useStore((s) => s.setSetup);
  const setStep = useStore((s) => s.setStep);
  const instruments = idx.instruments.instruments.filter((i) => i.modality === setup.modality && i.current);
  const roles = idx.instruments.reserved[setup.modality];
  const budget = useBudgetDetail();

  return (
    <div className="space-y-8">
      <section>
        <H2>What are you measuring?</H2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Tile label="Suspension cells (CyTOF)" sub="PBMC, blood, dissociated tissue" active={setup.modality === "suspension"} onClick={() => setSetup({ modality: "suspension" })} />
          <Tile label="Tissue imaging (IMC)" sub="FFPE or frozen sections on a Hyperion" active={setup.modality === "imaging"} onClick={() => setSetup({ modality: "imaging" })} />
        </div>
      </section>
      <section>
        <H2>Species</H2>
        <div className="flex flex-wrap gap-2">
          {SPECIES.map((s) => <Tile key={s.id} label={s.label} active={setup.species === s.id} onClick={() => setSetup({ species: s.id })} />)}
        </div>
      </section>
      <section>
        <H2>Sample</H2>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_TYPES[setup.modality].map((s) => <Tile key={s.id} label={s.label} active={setup.sampleType === s.id} onClick={() => setSetup({ sampleType: s.id })} />)}
        </div>
      </section>
      <section>
        <H2 hint="defaults to the current instrument for your application">Instrument</H2>
        <div className="flex flex-wrap gap-2">
          {instruments.map((i) => <Tile key={i.id} label={i.name} sub={`${i.channels.filter((c) => c.usable).length} detection channels`} active={setup.instrumentId === i.id} onClick={() => setSetup({ instrumentId: i.id })} />)}
        </div>
      </section>
      <section>
        <H2 hint="these reserve channels so antibodies never collide with them">Scaffolding</H2>
        <div className="space-y-2 text-sm">
          {roles.map((r) => {
            const fixed = r.role === "dna_intercalator";
            const toggle = r.role === "segmentation_kit" ? () => setSetup({ segmentation: !setup.segmentation })
              : r.role === "viability_cisplatin" ? () => setSetup({ viability: !setup.viability })
                : r.role === "barcoding_pd" ? () => setSetup({ barcoding: !setup.barcoding }) : undefined;
            const on = fixed || (r.role === "segmentation_kit" && setup.segmentation) || (r.role === "viability_cisplatin" && setup.viability) || (r.role === "barcoding_pd" && setup.barcoding);
            if (!fixed && !toggle) return null;
            return (
              <label key={r.role} className="flex items-center gap-3">
                <input type="checkbox" checked={on} disabled={fixed} onChange={toggle} className="h-4 w-4 accent-teal-700" />
                <span>{r.label}</span>
                <span className="text-xs text-slate-500">channels {r.masses.join(", ")}{fixed ? " · always" : ""}</span>
              </label>
            );
          })}
        </div>
        {budget && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300" data-testid="setup-budget">
            <b>{budget.available}</b> of {budget.instrument}&apos;s {budget.total} detection channels are left for antibodies
            {budget.lines.length > 0 && <> ({budget.lines.map((l) => `−${l.masses.length} ${l.label}`).join(", ")}{budget.blocked.length ? `, −${budget.blocked.length} kept empty` : ""})</>}.
          </p>
        )}
      </section>
      <BlockedChannels />
      <Button variant="primary" size="lg" onClick={() => setStep("build")}>Choose markers →</Button>
    </div>
  );
}

/** "Blank" channels: masses the optimiser must leave empty (an RPT nuclide such as Lu-177, or a reagent we do not model). */
function BlockedChannels() {
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const toggleBlocked = useStore((s) => s.toggleBlocked);
  const [open, setOpen] = useState(false);
  const inst = idx.instrument(setup.instrumentId);
  const reserved = new Map<number, string>();
  for (const r of idx.instruments.reserved[setup.modality]) {
    if (!reservedRoles(setup).includes(r.role)) continue;
    for (const m of r.masses) reserved.set(m, r.label);
  }
  const channels = inst.channels.filter((c) => c.usable);
  const n = setup.blocked.length;

  return (
    <section>
      <H2 hint="nothing will be assigned to them">Keep channels empty {n > 0 && <span className="font-normal">· {n} blocked</span>}</H2>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button size="sm" variant={open ? "secondary" : "ghost"} onClick={() => setOpen((v) => !v)} data-testid="blocked-toggle">
          {open ? "Hide channels" : n ? `Edit blocked channels (${n})` : "Block channels…"}
        </Button>
        <span className="text-xs text-slate-500">
          Reserve a channel for a radionuclide you will add later — Lu-177 for radiopharmaceutical therapy, for example — and
          the optimiser keeps it, and its spillover, out of your panel.
        </span>
      </div>
      {n > 0 && !open && (
        <div className="mt-2 flex flex-wrap gap-1" data-testid="blocked-summary">
          {setup.blocked.map((m) => (
            <button key={m} onClick={() => toggleBlocked(m)} title="unblock"
              className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] text-rose-800 hover:line-through dark:bg-rose-900 dark:text-rose-100">
              {inst.channels.find((c) => c.mass === m)?.label ?? m} ×
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-2 flex flex-wrap gap-1" data-testid="blocked-picker">
          {channels.map((c) => {
            const res = reserved.get(c.mass);
            const blocked = setup.blocked.includes(c.mass);
            return (
              <button key={c.mass} disabled={!!res} onClick={() => toggleBlocked(c.mass)}
                title={res ? `reserved for ${res}` : blocked ? "click to free this channel" : "click to keep this channel empty"}
                className={cx("rounded px-1.5 py-0.5 text-[11px] tabular-nums",
                  res ? "cursor-not-allowed bg-slate-100 text-slate-400 line-through dark:bg-slate-800 dark:text-slate-500"
                    : blocked ? "bg-rose-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700")}>
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

