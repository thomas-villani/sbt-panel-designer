"use client";
import { useState } from "react";
import { SAMPLE_TYPES, SPECIES, VIABILITY_ROLE, antibodyChannel, channelLabel, reservedChannels, reservedRoles } from "@/lib/data";
import { useStore } from "@/lib/store";
import type { Setup } from "@/lib/types";

const VIABILITY_CHOICES: { id: NonNullable<Setup["viabilityMode"]>; label: string }[] = [
  { id: "pt", label: "Cisplatin, natural Pt" }, { id: "pt195", label: "Cisplatin 195Pt" }, { id: "pt198", label: "Cisplatin 198Pt" }, { id: "rh103", label: "Rh103 intercalator" },
];
const roleMasses = (roles: { role: string; masses: number[] }[], id: string) => { const r = roles.find((x) => x.role === id); return r ? `${r.masses.length === 1 ? "channel" : "channels"} ${r.masses.join(", ")}` : ""; };

/** One labelled row of mutually exclusive options. */
function Choice({ label, value, options, onChange, testId }: { label: string; value: string; options: { id: string; label: string; sub?: string }[]; onChange: (id: string) => void; testId?: string }) {
  return (
    <div className="flex flex-wrap items-start gap-3" data-testid={testId}>
      <span className="w-28 shrink-0 pt-2 font-medium">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => <Tile key={o.id} label={o.label} sub={o.sub} active={value === o.id} onClick={() => onChange(o.id)} />)}
      </div>
    </div>
  );
}
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
    <div className="space-y-10">
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
          {instruments.map((i) => <Tile key={i.id} label={i.name} sub={`${i.channels.filter((c) => antibodyChannel(c, setup)).length} antibody channels`} active={setup.instrumentId === i.id} onClick={() => setSetup({ instrumentId: i.id })} />)}
        </div>
      </section>
      <section>
        <H2 hint="DNA stain, viability, barcoding: these reserve channels so antibodies never collide with them">Cell ID &amp; controls</H2>
        <div className="space-y-3 text-sm">
          {roles.filter((r) => r.role === "dna_intercalator").map((r) => (
            <div key={r.role} className="flex flex-wrap items-center gap-3"><span className="w-28 shrink-0 font-medium">DNA</span><span>{r.label}</span><span className="text-xs text-slate-600 dark:text-slate-400">channels {r.masses.join(", ")} · always</span></div>
          ))}
          {setup.modality === "suspension" && (
            <Choice label="Viability" value={setup.viability ? setup.viabilityMode ?? "pt" : "none"} testId="viability-choice"
              options={[{ id: "none", label: "None", sub: "no channel reserved" }, ...VIABILITY_CHOICES.map((c) => ({ ...c, sub: roleMasses(roles, VIABILITY_ROLE[c.id]) }))]}
              onChange={(v) => setSetup(v === "none" ? { viability: false } : { viability: true, viabilityMode: v as Setup["viabilityMode"] })} />
          )}
          {setup.modality === "suspension" && (
            <Choice label="Barcoding" value={setup.barcoding ? "pd" : "none"} testId="barcoding-choice"
              options={[{ id: "none", label: "None", sub: "no channel reserved" }, { id: "pd", label: "Cell-ID 20-Plex Pd", sub: roleMasses(roles, "barcoding_pd") }]}
              onChange={(v) => setSetup({ barcoding: v === "pd" })} />
          )}
          {setup.modality === "imaging" && roles.filter((r) => r.role === "segmentation_kit").map((r) => (
            <Choice key={r.role} label="Segmentation" value={setup.segmentation ? "kit" : "none"} testId="segmentation-choice"
              options={[{ id: "kit", label: "Cell segmentation kit", sub: `Pt · channels ${r.masses.join(", ")}` }, { id: "none", label: "None", sub: "segment on DNA and membrane markers" }]}
              onChange={(v) => setSetup({ segmentation: v === "kit" })} />
          ))}
          {(() => { const id = reservedRoles(setup).find((x) => x.startsWith("viability")); const r = roles.find((x) => x.role === id); return r?.note ? <p className="text-xs text-slate-600 dark:text-slate-400">{r.note}</p> : null; })()}
        </div>
        {budget && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300" data-testid="setup-budget">
            <b>{budget.available}</b> of {budget.instrument}&apos;s {budget.total} channels are left for antibodies
            {budget.lines.length > 0 && <> ({budget.lines.map((l) => `−${l.masses.length} ${l.label}`).join(", ")}{budget.blocked.length ? `, −${budget.blocked.length} kept empty` : ""})</>}.
          </p>
        )}
      </section>
      <BlockedChannels />
      <AdvancedMetals />
      <Button variant="primary" size="lg" onClick={() => setStep("build")}>Choose markers →</Button>
    </div>
  );
}

/** Metals SBT does not list for this modality (Cd on IMC) that some labs use anyway: opt in, and every marker that lands on one is labelled. */
function AdvancedMetals() {
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const setSetup = useStore((s) => s.setSetup);
  const [open, setOpen] = useState(!!setup.extraMetals?.length);
  const groups = idx.instruments.advanced?.[setup.modality] ?? [];
  const inst = idx.instrument(setup.instrumentId);
  if (!groups.length) return null;
  const on = (g: { masses: number[] }) => g.masses.some((m) => setup.extraMetals?.includes(m));
  const toggle = (g: { masses: number[] }) => {
    const cur = new Set(setup.extraMetals ?? []);
    if (on(g)) for (const m of g.masses) cur.delete(m); else for (const m of g.masses) if (inst.channels.some((c) => c.mass === m && c.usable)) cur.add(m);
    setSetup({ extraMetals: [...cur].sort((a, b) => a - b) });
  };
  return (
    <section data-testid="advanced-metals">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full flex-wrap items-baseline gap-2 text-left" data-testid="advanced-metals-toggle">
        <span className={cx("inline-block text-sm transition", open && "rotate-90")}>▸</span>
        <h2 className="text-lg font-semibold tracking-tight">Metals beyond the catalogue</h2>
        <span className="text-xs text-slate-600 dark:text-slate-400">{groups.some(on) ? `${groups.filter(on).map((g) => g.label).join(", ")} opted in` : "not on the Standard BioTools conjugation list for this application"}</span>
      </button>
      {open && <div className="mt-3 space-y-2 text-sm">
        {groups.map((g) => (
          <label key={g.id} className="flex items-start gap-3">
            <input type="checkbox" checked={on(g)} onChange={() => toggle(g)} className="mt-1 h-4 w-4 accent-teal-700" />
            <span>
              <span className="font-medium">{g.label}</span>
              <span className="ml-2 text-xs text-slate-600 dark:text-slate-400">channels {g.masses.join(", ")}{on(g) ? " · markers placed here are flagged on Balance and Order" : ""}</span>
              <span className="block text-xs text-amber-800 dark:text-amber-300">{g.note}</span>
            </span>
          </label>
        ))}
      </div>}
    </section>
  );
}

/** "Blank" channels: masses the optimiser must leave empty (an RPT nuclide such as Lu-177, or a reagent we do not model). */
function BlockedChannels() {
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const toggleBlocked = useStore((s) => s.toggleBlocked);
  const [open, setOpen] = useState(false);
  const inst = idx.instrument(setup.instrumentId);
  const reserved = reservedChannels(idx, setup);
  const channels = inst.channels.filter((c) => antibodyChannel(c, setup));
  const n = setup.blocked.length;

  return (
    <section>
      <H2 hint="nothing will be assigned to them">Keep channels empty {n > 0 && <span className="font-normal">· {n} blocked</span>}</H2>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button size="sm" variant={open ? "secondary" : "ghost"} onClick={() => setOpen((v) => !v)} data-testid="blocked-toggle">
          {open ? "Hide channels" : n ? `Edit blocked channels (${n})` : "Block channels…"}
        </Button>
        <span className="text-xs text-slate-600 dark:text-slate-400">
          Any channel you would rather not use: one you are saving for a reagent we do not list, a channel your instrument
          struggles with, or a radionuclide you will add later (Lu-177, say). The optimiser keeps it, and its spillover, out of your panel.
          You can also click any open channel on the Balance page.
        </span>
      </div>
      {n > 0 && !open && (
        <div className="mt-2 flex flex-wrap gap-1" data-testid="blocked-summary">
          {setup.blocked.map((m) => (
            <button key={m} onClick={() => toggleBlocked(m)} title="unblock"
              className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] text-rose-800 hover:line-through dark:bg-rose-900 dark:text-rose-100">
              {channelLabel(idx, setup, m)} ×
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

