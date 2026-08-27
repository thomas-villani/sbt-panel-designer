"use client";
/**
 * Balance as a triage, not a list. Blockers (too many markers) come first as one decision with ranked drops; then
 * whatever the user pinned, so a chain of fixes never becomes invisible; then the spillover the optimiser could not
 * solve, one recommended action each; the rest folds away.
 */
import { useMemo, useState, type ReactNode } from "react";
import { SPILL_CRIT, SPILL_WARN, type Warning } from "@pd3/engine";
import { kitSupplies } from "@/lib/data";
import { plainWarning } from "@/lib/health";
import { useHealth, useStore, type CloneTrial, type FixPreview } from "@/lib/store";
import { MassStrip } from "./MassStrip";
import { OpenChannels } from "./OpenChannels";
import { SpillTable } from "./SpillTable";
import { Button, H2, Pill, cx } from "./ui";

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
  const channelName = (m: number) => instrument.channels.find((c) => c.mass === m)?.label ?? String(m);
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
        {engineError ? <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">Engine error: {engineError}</div> : <div className="text-sm text-slate-600 dark:text-slate-400">Balancing…</div>}
      </div>
    );
  }

  const { over, unassigned, drops, moduleDrops, conflicts, checks, notes, unlikely, accepted, custom, customKnown, pinned } = health;
  const blocked = over > 0 || unassigned.length > 0;
  const nDrop = Math.min(drops.length, Math.max(over, unassigned.length));
  const dropSuggested = () => { for (const d of drops.slice(0, nDrop)) removeRow(d.row.id); };
  // While the panel does not fit, the spillover picture is provisional: keep it out of the way until it does.
  const mustFix = blocked ? 0 : conflicts.length + custom.length;
  const modulesFirst = over >= 4 && moduleDrops.length > 0;
  const shownModules = moduleDrops.slice(0, 8);
  const headline = blocked ? "The panel does not fit yet" : mustFix ? `${mustFix} thing${mustFix > 1 ? "s" : ""} to fix` : checks.length ? "Panel fits" : "Panel is balanced";
  const hint = blocked ? undefined : mustFix ? undefined : checks.length ? `${checks.length} worth checking` : "nothing to fix";

  return (
    <div className="space-y-6">
      <section>
        <H2 hint={`${result.stats.ms.toFixed(0)} ms · re-runs on every change`}>
          <span className="flex items-center gap-2">Balance{balancing && <span className="text-xs font-normal text-slate-600 dark:text-slate-400">updating…</span>}</span>
        </H2>
        {engineError && <div className="mb-3 rounded-md bg-rose-50 p-3 text-sm text-rose-800">Engine error: {engineError}</div>}
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
        <H2 hint={hint}>{headline}</H2>

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
          {!blocked && conflicts.map((w, i) => <WarnCard key={`c${i}`} w={w} tone="rose" label="must fix" onRemove={removeRow} onUnpin={(id) => lockRow(id, null)} />)}
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
          <Fold open={showChecks} onToggle={() => setShowChecks((v) => !v)} label={`${checks.length} worth checking`} hint="spill above half tolerance, dim markers on weak channels">
            {checks.map((w, i) => <WarnCard key={`w${i}`} w={w} tone="amber" label="worth checking" onRemove={removeRow} onUnpin={(id) => lockRow(id, null)} />)}
          </Fold>
        )}
        {!blocked && unlikely.length > 0 && (
          <Fold open={showUnlikely} onToggle={() => setShowUnlikely((v) => !v)} label={`${unlikely.length} unlikely to matter`} hint="spill between markers that never share a cell" testId="unlikely">
            {unlikely.map(({ w, why }, i) => <WarnCard key={`u${i}`} w={w} tone="slate" label="unlikely" note={why} onRemove={removeRow} onUnpin={(id) => lockRow(id, null)} />)}
          </Fold>
        )}
        {!blocked && accepted.length > 0 && (
          <Fold open={showAccepted} onToggle={() => setShowAccepted((v) => !v)} label={`${accepted.length} accepted by you`} hint="listed on the Order page" testId="accepted">
            {accepted.map(({ w, reason }, i) => (
              <WarnCard key={`a${i}`} w={w} tone="slate" label="accepted" note={`Your note: ${reason}`} onRemove={removeRow} onUnpin={(id) => lockRow(id, null)}
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
            {notes.map((w, i) => <WarnCard key={`n${i}`} w={w} tone="slate" label="FYI" onRemove={removeRow} onUnpin={(id) => lockRow(id, null)} />)}
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
          <p className="mt-2"><b>What the score means.</b> For each marker we add up the counts it receives from every other marker and divide by its tolerance (how much noise it can take before populations blur). Sum over markers = the score; lower is better. "Worth checking" means a marker receives more than half its tolerance, "must fix" above 1×.</p>
          <p className="mt-2"><b>Why is there anything left to fix?</b> The optimiser has already tried every channel for every marker. What is listed here is what no re-arrangement solves: the real levers are dropping a marker, picking another clone (sold on other metals), or accepting the spill.</p>
        </section>
      )}

      {showHeat && <HeatMap />}
    </div>
  );
}

function Fold({ open, onToggle, label, hint, children, testId }: { open: boolean; onToggle: () => void; label: string; hint: string; children: ReactNode; testId?: string }) {
  return (
    <div className="mt-3" data-testid={testId}>
      <button onClick={onToggle} aria-expanded={open} className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-teal-700 dark:text-slate-200 dark:hover:text-teal-300">
        <span className={cx("inline-block transition", open && "rotate-90")}>▸</span>{label}<span className="text-xs font-normal text-slate-600 dark:text-slate-400">{hint}</span>
      </button>
      {open && <ul className="mt-2 space-y-2">{children}</ul>}
    </div>
  );
}

function WarnCard({ w, tone, label, note, extra, onRemove, onUnpin }: {
  w: Warning; tone: "rose" | "amber" | "slate"; label: string; note?: string; extra?: ReactNode;
  onRemove: (id: string) => void; onUnpin: (id: string) => void;
}) {
  const result = useStore((s) => s.result)!;
  const rows = useStore((s) => s.rows);
  const previewFix = useStore((s) => s.previewFix);
  const commitPreview = useStore((s) => s.commitPreview);
  const cloneAlternatives = useStore((s) => s.cloneAlternatives);
  const acceptWarning = useStore((s) => s.acceptWarning);
  const setClone = useStore((s) => s.setClone);
  const [more, setMore] = useState(false);
  const [preview, setPreview] = useState<FixPreview | null>(null);
  const [busy, setBusy] = useState<"preview" | "clones" | null>(null);
  const [trials, setTrials] = useState<CloneTrial[] | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null); // null = closed; "" = input open
  const { title, action } = plainWarning(w, result);
  const rr = result.rows.find((r) => r.rowId === w.rowId);
  const me = rows.find((r) => r.id === w.rowId);
  const donor = rr?.contributions[0];
  const donorRow = donor ? rows.find((r) => r.id === donor.rowId) : undefined;
  const spill = w.code === "spillover";
  const canTryClones = spill && [me, donorRow].some((r) => r?.targetId && r.clone && r.clonePinned); // free rows: the optimiser already tried every clone
  const box = { rose: "border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950", amber: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950", slate: "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" }[tone];

  const tryFix = async () => {
    if (!w.fix) return;
    setBusy("preview");
    try { setPreview(await previewFix(w.fix)); } finally { setBusy(null); }
  };
  const tryClones = async () => {
    setBusy("clones");
    try {
      const ids = [me, donorRow].filter((r): r is NonNullable<typeof r> => !!r?.targetId && !!r.clone && !!r.clonePinned).map((r) => r.id);
      const all = (await Promise.all(ids.map((id) => cloneAlternatives(id)))).flat();
      setTrials(all.sort((a, b) => a.score - b.score));
    } finally { setBusy(null); }
  };
  const resolves = (t: CloneTrial) => {
    // The receiver of this warning must end up under the "must fix" line, whichever row changed clone.
    const mine = t.result.rows.find((r) => r.rowId === w.rowId);
    return !!mine && mine.mass != null && mine.receivedOverT < 1 && t.result.unassigned.length === 0;
  };
  const nameOf = (id: string) => rows.find((r) => r.id === id)?.name ?? id;

  return (
    <li className={cx("rounded-lg border p-3 text-sm", box)} data-testid="warning" data-code={w.code}>
      <div className="flex flex-wrap items-start gap-3">
        <Pill tone={tone}>{label}</Pill>
        <div className="min-w-[12rem] flex-1">
          <div>{title}</div>
          {note && <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{note}</div>}
          {action && !note && <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{w.fix ? "Suggested: " : ""}{action}</div>}
          {title !== w.message && (
            <button className="mt-1 text-xs text-slate-600 dark:text-slate-400 underline decoration-dotted" onClick={() => setMore((v) => !v)}>{more ? "less" : "details"}</button>
          )}
          {more && <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{w.message}</div>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          {extra}
          {w.fix && !preview && <Button size="sm" variant="primary" disabled={busy != null} onClick={tryFix}>{busy === "preview" ? "Trying…" : "Try the move"}</Button>}
          {canTryClones && !trials && tone !== "slate" && <Button size="sm" disabled={busy != null} onClick={tryClones}>{busy === "clones" ? "Checking clones…" : "Change clone"}</Button>}
          {spill && tone !== "slate" && accepting === null && <Button size="sm" onClick={() => setAccepting("")}>Accept</Button>}
          {w.code === "reserved_lock" && <Button size="sm" variant="primary" onClick={() => onUnpin(w.rowId)}>Unpin</Button>}
          {spill && donorRow && tone !== "slate" && <Button size="sm" variant="danger" onClick={() => onRemove(donorRow.id)}>Drop {donor!.label}</Button>}
          {spill && tone !== "slate" && <Button size="sm" variant="danger" onClick={() => onRemove(w.rowId)}>Drop {rr?.label ?? ""}</Button>}
        </div>
      </div>

      {preview && (
        <div className="mt-3 rounded-md border border-slate-300 bg-white p-3 text-xs dark:border-slate-600 dark:bg-slate-900" data-testid="fix-preview">
          <div className={cx("font-medium", preview.after <= preview.before + 1e-6 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")}>
            {preview.after <= preview.before + 1e-6
              ? `Panel score ${preview.before.toFixed(2)} → ${preview.after.toFixed(2)} (better).`
              : `Panel score ${preview.before.toFixed(2)} → ${preview.after.toFixed(2)}: the panel as a whole gets worse.`}
          </div>
          <div className="mt-1 text-slate-600 dark:text-slate-300">
            {preview.moves.length === 0 ? "Nothing would move." : <>{preview.moves.length} marker{preview.moves.length > 1 ? "s" : ""} would move: {preview.moves.map((m) => `${m.label} ${m.from} → ${m.to}`).join("; ")}.</>}
            {" "}{preview.moves.length > 0 && `${preview.moves.length > 1 ? "They stay" : "It stays"} pinned there until you unpin.`}
          </div>
          <div className="mt-2 flex gap-1">
            <Button size="sm" variant={preview.after <= preview.before + 1e-6 ? "primary" : "secondary"} disabled={preview.moves.length === 0} onClick={() => { commitPreview(preview); setPreview(null); }}>
              {preview.after <= preview.before + 1e-6 ? "Keep it" : "Keep it anyway"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {trials && (
        <div className="mt-3 rounded-md border border-slate-300 bg-white p-3 text-xs dark:border-slate-600 dark:bg-slate-900" data-testid="clone-trials">
          {trials.length === 0 && <div className="text-slate-600 dark:text-slate-300">No other catalogue clone for {me?.name}{donorRow ? ` or ${donorRow.name}` : ""} in this setup.</div>}
          {trials.length > 0 && <div className="mb-1 text-slate-600 dark:text-slate-300">Other clones, re-balanced around each:</div>}
          <ul className="space-y-1">
            {trials.map((t) => (
              <li key={`${t.rowId}-${t.clone}`} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">
                  <b>{nameOf(t.rowId)}</b> → clone {t.clone} <span className="text-slate-600 dark:text-slate-400">({t.nMetals} metal{t.nMetals > 1 ? "s" : ""}{t.channel ? `, lands on ${t.channel}` : ""})</span>
                  {" · "}
                  {resolves(t) ? <span className="text-emerald-700 dark:text-emerald-300">resolves this</span> : <span className="text-slate-600 dark:text-slate-400">still {Math.round((t.result.rows.find((r) => r.rowId === w.rowId)?.receivedOverT ?? 0) * 100)} %</span>}
                  <span className="text-slate-600 dark:text-slate-400"> · score {t.score.toFixed(2)}</span>
                </span>
                <Button size="sm" variant={resolves(t) ? "primary" : "secondary"} onClick={() => { setClone(t.rowId, t.clone); setTrials(null); }}>Use</Button>
              </li>
            ))}
          </ul>
          <button className="mt-2 text-slate-600 dark:text-slate-400 underline decoration-dotted" onClick={() => setTrials(null)}>close</button>
        </div>
      )}

      {accepting !== null && (
        <form className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-white p-3 text-xs dark:border-slate-600 dark:bg-slate-900" data-testid="accept-form"
          onSubmit={(e) => { e.preventDefault(); acceptWarning(w.rowId, accepting); setAccepting(null); }}>
          <span className="text-slate-600 dark:text-slate-300">Why is this fine?</span>
          <input autoFocus value={accepting} onChange={(e) => setAccepting(e.target.value)} placeholder={donor ? `e.g. ${donor.label} and ${rr?.label} are on different cells` : "e.g. not co-expressed"}
            className="min-w-[14rem] flex-1 rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900" aria-label="reason" />
          <Button size="sm" variant="primary" onClick={() => { acceptWarning(w.rowId, accepting); setAccepting(null); }}>Accept</Button>
          <Button size="sm" variant="ghost" onClick={() => setAccepting(null)}>Cancel</Button>
        </form>
      )}
    </li>
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
                <td className="p-0.5 text-slate-600 dark:text-slate-400">{g.channel}</td>
                {rows.map((r) => {
                  const f = cell.get(`${g.rowId}>${r.rowId}`) ?? 0;
                  const bg = f === 0 ? undefined : f >= SPILL_CRIT ? "#f43f5e" : f >= SPILL_WARN ? "#fbbf24" : f >= 0.1 ? "#a7f3d0" : "#ecfdf5";
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
