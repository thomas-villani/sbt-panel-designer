"use client";
/**
 * Balance as a triage, not a list. Blockers (too many markers) come first as one decision with ranked drops; then
 * whatever the user pinned, so a chain of fixes never becomes invisible; then the spillover the optimiser could not
 * solve, one recommended action each; the rest folds away.
 */
import { useMemo, useState } from "react";
import { SPILL_CRIT, SPILL_WARN } from "@pd3/engine";
import { channelLabel, kitSupplies } from "@/lib/data";
import { useHealth, useStore } from "@/lib/store";
import { EngineError } from "./EngineError";
import { HeatMap } from "./HeatMap";
import { MassStrip } from "./MassStrip";
import { OpenChannels } from "./OpenChannels";
import { SpillTable } from "./SpillTable";
import { Fold, WarnCard } from "./WarnCard";
import { Button, H2, Pill } from "./ui";

export function BalanceStep() {
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const rows = useStore((s) => s.rows);
  const result = useStore((s) => s.result);
  const balancing = useStore((s) => s.balancing);
  const engineError = useStore((s) => s.engineError);
  const notice = useStore((s) => s.notice);
  const dismissNotice = useStore((s) => s.dismissNotice);
  const lockRow = useStore((s) => s.lockRow);
  const removeRow = useStore((s) => s.removeRow);
  const removeModule = useStore((s) => s.removeModule);
  const setClone = useStore((s) => s.setClone);
  const setStep = useStore((s) => s.setStep);
  const health = useHealth();
  const [showHeat, setShowHeat] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showUnlikely, setShowUnlikely] = useState(false);
  const [showAccepted, setShowAccepted] = useState(false);
  const [showKnown, setShowKnown] = useState(false);
  const unacceptWarning = useStore((s) => s.unacceptWarning);
  const instrument = idx.instrument(setup.instrumentId);
  // Kit markers sit on the kit's metals by definition: one chip per kit, not thirty pins.
  const kitPins = useMemo(() => {
    const byKit = new Map<string, { name: string; rows: string[] }>();
    for (const r of rows) {
      if (r.locked == null) continue;
      const kit = r.moduleIds.find((id) => idx.modulesById.get(id)?.source === "sbt_kit" && kitSupplies(idx, { ...r, moduleIds: [id] }, r.locked));
      if (!kit) continue;
      const e = byKit.get(kit) ?? { name: idx.modulesById.get(kit)?.name ?? kit, rows: [] };
      e.rows.push(r.id);
      byKit.set(kit, e);
    }
    return byKit;
  }, [idx, rows]);
  const kitRowIds = useMemo(() => new Set([...kitPins.values()].flatMap((k) => k.rows)), [kitPins]);
  const channelName = (m: number) => channelLabel(idx, setup, m);
  // Spill the user accepted, or that lands where it cannot matter, paints the strip green: the headline and the strip agree.
  const waived = useMemo(() => new Set([...(health?.unlikely ?? []).map((u) => u.w.rowId), ...(health?.accepted ?? []).map((a) => a.w.rowId)]), [health]);

  if (!rows.length) {
    return (
      <div className="space-y-4">
        <H2>Balance</H2>
        <p className="text-sm text-slate-600 dark:text-slate-300">Nothing to balance yet.</p>
        <Button variant="primary" onClick={() => setStep("build")}>← Add markers</Button>
      </div>
    );
  }
  if (!result || !health) {
    return (
      <div className="space-y-6">
        <H2>Balance</H2>
        {engineError ? <EngineError message={engineError} /> : <div className="text-sm text-slate-600 dark:text-slate-400">Balancing…</div>}
      </div>
    );
  }

  // One reading of the panel, shared with the sidebar (lib/health.ts), so the page heading and the sidebar line agree.
  const { over, unassigned, drops, moduleDrops, conflicts, checks, notes, unlikely, accepted, custom, customKnown, pinned, blocked, mustFix, pageHeadline: headline, pageHint: hint } = health;
  const nDrop = Math.min(drops.length, Math.max(over, unassigned.length));
  const cardCtx = { result, rows, onRemove: removeRow, onUnpin: (id: string) => lockRow(id, null) };
  const dropSuggested = () => { for (const d of drops.slice(0, nDrop)) removeRow(d.row.id); };
  const modulesFirst = over >= 4 && moduleDrops.length > 0;
  const shownModules = moduleDrops.slice(0, 8);

  return (
    <div className="space-y-6">
      <section>
        <H2 hint={`${result.stats.ms.toFixed(0)} ms · re-runs on every change`}>
          <span className="flex items-center gap-2">Balance{balancing && <span className="text-xs font-normal text-slate-600 dark:text-slate-400">updating…</span>}</span>
        </H2>
        {engineError && <div className="mb-3"><EngineError message={engineError} /></div>}
        <MassStrip instrument={instrument} result={result} waived={waived} />
        <OpenChannels className="mt-3" />
      </section>

      {notice && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950" data-testid="fix-notice">
          <div className="flex-1">{notice}</div>
          <button className="text-slate-400 hover:text-slate-700" onClick={dismissNotice} aria-label="dismiss">×</button>
        </div>
      )}

      <section>
        <H2 hint={hint ?? undefined}>{headline}</H2>

        {blocked && (
          <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm dark:border-rose-800 dark:bg-rose-950" data-testid="blocker">
            <div className="font-semibold">
              {over > 0
                ? `${rows.length} markers, but the ${instrument.name} has ${health.budget} channels for antibodies: drop ${over}.`
                : `${rows.length} of ${health.budget} channels used, but ${unassigned.length} marker${unassigned.length > 1 ? "s" : ""} cannot get one: every metal ${unassigned.length > 1 ? "their clones are" : "its clone is"} sold on is already taken.`}
            </div>
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              {over > 0
                ? "Until it fits, the optimiser leaves some markers out and everything below is provisional."
                : "Switch it to a custom conjugation (you supply the antibody, Maxpar X8 labelling, any free lanthanide), drop it, or drop the neighbour sitting on its metal."}
            </div>
            {modulesFirst && (
              <>
                <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-rose-800 dark:text-rose-200">Quickest: remove a marker set you can live without</div>
                <ul className="mt-1 divide-y divide-rose-200/70 dark:divide-rose-900" data-testid="module-drops">
                  {shownModules.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 py-1.5">
                      <span className="min-w-0 flex-1"><span className="font-medium">{m.name}</span><span className="ml-2 text-xs text-slate-600 dark:text-slate-300">frees {m.frees} channel{m.frees === 1 ? "" : "s"}</span></span>
                      <Button size="sm" variant="danger" onClick={() => removeModule(m.id)}>Remove set</Button>
                    </li>
                  ))}
                  {moduleDrops.length > shownModules.length && <li className="py-1 text-xs text-slate-600 dark:text-slate-400">…and {moduleDrops.length - shownModules.length} more; the Build page lists them all.</li>}
                </ul>
                <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-rose-800 dark:text-rose-200">Or trim single markers, most expendable first</div>
              </>
            )}
            {!modulesFirst && over > 0 && <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">Suggested drops, most expendable first:</div>}
            <ul className="mt-1 divide-y divide-rose-200/70 dark:divide-rose-900">
              {drops.map((d, i) => (
                <li key={d.row.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-5 text-right text-xs text-slate-600 dark:text-slate-400">{i + 1}.</span>
                  <span className="min-w-0 flex-1"><span className="font-medium">{d.row.name}</span><span className="ml-2 text-xs text-slate-600 dark:text-slate-300">{d.reason}</span></span>
                  {d.canGoCustom && <Button size="sm" variant="primary" title="Any free lanthanide; you supply the antibody" onClick={() => setClone(d.row.id, null)}>Custom conjugation</Button>}
                  <Button size="sm" variant="danger" onClick={() => removeRow(d.row.id)}>Drop</Button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              {nDrop > 1 && nDrop >= over && <Button size="sm" variant="primary" onClick={dropSuggested}>Drop the {nDrop} suggested</Button>}
              <Button size="sm" onClick={() => setStep("build")}>← Back to Build</Button>
            </div>
          </div>
        )}

        {pinned.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm dark:border-slate-600 dark:bg-slate-800" data-testid="pinned">
            <span className="text-slate-600 dark:text-slate-300">{pinned.length > kitRowIds.size ? "Pinned by you or a fix — the optimiser must work around these:" : "On kit metals — the optimiser works around them:"}</span>
            {[...kitPins].map(([id, k]) => <Pill key={id} tone="violet" title={`${k.rows.length} markers on the metals ${k.name} ships with; click to free them all`} onClick={() => k.rows.forEach((r) => lockRow(r, null))}>📦 {k.name} · {k.rows.length} ×</Pill>)}
            {pinned.filter((r) => !kitRowIds.has(r.id)).map((r) => <Pill key={r.id} tone="slate" title="unpin" onClick={() => lockRow(r.id, null)}>🔒 {r.name} → {channelName(r.locked!)} ×</Pill>)}
            <span className="flex-1" />
            <Button size="sm" onClick={() => pinned.forEach((r) => lockRow(r.id, null))}>Unpin all ({pinned.length})</Button>
          </div>
        )}

        <ul className="space-y-2">
          {!blocked && conflicts.map((w) => <WarnCard key={`c:${w.code}:${w.rowId}`} w={w} tone="rose" label="must fix" {...cardCtx} />)}
          {!blocked && custom.map((c) => (
            <li key={`custom-${c.rowId}`} className="flex flex-wrap items-start gap-3 rounded-lg border border-violet-300 bg-violet-50 p-3 text-sm dark:border-violet-800 dark:bg-violet-950" data-testid="custom-conjugation-warning">
              <Pill tone="violet">metal not sold</Pill>
              <div className="min-w-[12rem] flex-1">
                <div>{c.message}</div>
                {c.detail && <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{c.detail}</div>}
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  {c.fix ? <>Recommended: move it to {c.fix.channel}, where the clone is sold, and re-balance around it.</> : "Keep it as a custom conjugation (Maxpar X8 kit, extra lead time) or drop it."}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {c.fix && <Button size="sm" variant="primary" onClick={() => lockRow(c.rowId, c.fix!.mass)}>Use {c.fix.channel}</Button>}
                <Button size="sm" variant="danger" onClick={() => removeRow(c.rowId)}>Remove</Button>
              </div>
            </li>
          ))}
        </ul>

        {!blocked && !mustFix && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {checks.length ? "Every marker has a channel and nothing drowns anything else. A few pairs sit closer than ideal; the table shows which." : "Every marker has a channel and nothing spills more than its neighbour can take."}
          </p>
        )}

        {!blocked && (
          <div className="mt-4">
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>Spill in and out per marker, as a share of what the receiving marker can take. Hover a row for the detail.</span>
              <span>Worth checking from {SPILL_WARN * 100} %, must fix from {SPILL_CRIT * 100} %</span>
            </div>
            <SpillTable result={result} health={health} />
          </div>
        )}

        {!blocked && checks.length > 0 && (
          <Fold open={showChecks} onToggle={() => setShowChecks((v) => !v)} label={`${checks.length} worth checking`} hint={`spill between ${SPILL_WARN} × and ${SPILL_CRIT} × tolerance, dim markers on weak channels`}>
            {checks.map((w) => <WarnCard key={`w:${w.code}:${w.rowId}`} w={w} tone="amber" label="worth checking" {...cardCtx} />)}
          </Fold>
        )}
        {!blocked && unlikely.length > 0 && (
          <Fold open={showUnlikely} onToggle={() => setShowUnlikely((v) => !v)} label={`${unlikely.length} unlikely to matter`} hint="spill between markers that never share a cell" testId="unlikely">
            {unlikely.map(({ w, why }) => <WarnCard key={`u:${w.code}:${w.rowId}`} w={w} tone="slate" label="unlikely" note={why} {...cardCtx} />)}
          </Fold>
        )}
        {!blocked && accepted.length > 0 && (
          <Fold open={showAccepted} onToggle={() => setShowAccepted((v) => !v)} label={`${accepted.length} accepted by you`} hint="listed on the Order page" testId="accepted">
            {accepted.map(({ w, reason }) => (
              <WarnCard key={`a:${w.code}:${w.rowId}`} w={w} tone="slate" label="accepted" note={`Your note: ${reason}`} {...cardCtx}
                extra={<Button size="sm" onClick={() => unacceptWarning(w.rowId)}>Reconsider</Button>} />
            ))}
          </Fold>
        )}
        {customKnown.length > 0 && (
          <Fold open={showKnown} onToggle={() => setShowKnown((v) => !v)} label={`${customKnown.length} conjugated to order`} hint={`no ${setup.modality === "imaging" ? "IMC" : "CyTOF"} catalogue antibody — known since Build; you supply the antibody, Maxpar X8 labelling`} testId="custom-known">
            {customKnown.map((c) => (
              <li key={`known-${c.rowId}`} className="flex flex-wrap items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800" data-testid="custom-known-row">
                <Pill tone="violet">to order</Pill>
                <div className="min-w-[12rem] flex-1">
                  <div>{c.name} goes on {c.channel}.</div>
                  {c.detail && <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{c.detail}</div>}
                </div>
                <Button size="sm" variant="danger" onClick={() => removeRow(c.rowId)}>Drop</Button>
              </li>
            ))}
          </Fold>
        )}
        {!blocked && notes.length > 0 && (
          <Fold open={showNotes} onToggle={() => setShowNotes((v) => !v)} label={`${notes.length} FYI`} hint="nothing to do">
            {notes.map((w) => <WarnCard key={`n:${w.code}:${w.rowId}`} w={w} tone="slate" label="FYI" {...cardCtx} />)}
          </Fold>
        )}
      </section>

      <section className="flex flex-wrap items-center gap-2 text-sm">
        <Button size="sm" onClick={() => setShowHeat(!showHeat)}>{showHeat ? "Hide" : "Show"} overlap map</Button>
        <Button size="sm" variant="ghost" onClick={() => setShowWhy(!showWhy)}>Why metals matter</Button>
        <span className="flex-1" />
        <Button variant="primary" onClick={() => setStep("order")} disabled={blocked}>Order / export →</Button>
      </section>

      {showWhy && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed dark:border-slate-700 dark:bg-slate-900">
          <p><b>Sensitivity.</b> The mass cytometer detects some isotopes better than others: channels 153–176 are the sweet spot, 89Y and 141–152 are less sensitive, and the heavy end (&gt; 176) sits in between. Put dim markers (few molecules per cell) on sensitive channels and bright markers where sensitivity is poor.</p>
          <p className="mt-2"><b>Spillover.</b> A fraction of each metal's signal leaks into neighbouring channels: M±1 from isotopic impurity, M+16 when the metal forms an oxide, and the same element's other isotopes. The overlap matrix says how much (in %). A bright marker on 141Pr sends about 2–3 % of its signal to 157Gd, which drowns a dim marker sitting there.</p>
          <p className="mt-2"><b>What the score means.</b> For each marker we add up the counts it receives from every other marker and divide by its tolerance (how much noise it can take before populations blur). Sum over markers = the score; lower is better. "Worth checking" means a marker receives at least {SPILL_WARN} × its tolerance, "must fix" from {SPILL_CRIT} × (thresholds calibrated so SBT's own kits, run on their metals, sit at "worth checking" at most).</p>
          <p className="mt-2"><b>Why is there anything left to fix?</b> The optimiser has already tried every channel for every marker. What is listed here is what no re-arrangement solves: the real levers are dropping a marker, picking another clone (sold on other metals), or accepting the spill.</p>
        </section>
      )}

      {showHeat && <HeatMap result={result} />}
    </div>
  );
}
