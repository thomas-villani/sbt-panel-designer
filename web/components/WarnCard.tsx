"use client";
import { useState, type ReactNode } from "react";
import { SPILL_CRIT, type Result, type Warning } from "@pd3/engine";
import { plainWarning } from "@/lib/health";
import { useStore, type CloneTrial, type FixPreview } from "@/lib/store";
import type { PanelRow } from "@/lib/types";
import { Button, Pill, cx } from "./ui";

/** A collapsible group of cards ("3 worth checking"), closed by default. */
export function Fold({ open, onToggle, label, hint, children, testId }: { open: boolean; onToggle: () => void; label: string; hint: string; children: ReactNode; testId?: string }) {
  return (
    <div className="mt-3" data-testid={testId}>
      <button onClick={onToggle} aria-expanded={open} className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-teal-700 dark:text-slate-200 dark:hover:text-teal-300">
        <span className={cx("inline-block transition", open && "rotate-90")}>▸</span>{label}<span className="text-xs font-normal text-slate-600 dark:text-slate-400">{hint}</span>
      </button>
      {open && <ul className="mt-2 space-y-2">{children}</ul>}
    </div>
  );
}

export type WarnTone = "rose" | "amber" | "slate";

export interface WarnCardProps {
  w: Warning;
  tone: WarnTone;
  label: string;
  /** Replaces the suggested-action line (why it is unlikely to matter, the user's accept note). */
  note?: string;
  extra?: ReactNode;
  result: Result;
  rows: readonly PanelRow[];
  onRemove: (id: string) => void;
  onUnpin: (id: string) => void;
}

/**
 * One warning as a card with its fixes: try the move, change clone, accept with a note, drop either side.
 * State comes in through props (the page says which result / rows it is about); only store *actions* are bound here.
 */
export function WarnCard({ w, tone, label, note, extra, result, rows, onRemove, onUnpin }: WarnCardProps) {
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
    // The receiver of this warning must end up under the "must fix" line (SPILL_CRIT), whichever row changed clone.
    const mine = t.result.rows.find((r) => r.rowId === w.rowId);
    return !!mine && mine.mass != null && mine.receivedOverT < SPILL_CRIT && t.result.unassigned.length === 0;
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
          onSubmit={(e) => { e.preventDefault(); if (acceptWarning(w.rowId, accepting)) setAccepting(null); }}>
          <span className="text-slate-600 dark:text-slate-300">Why is this fine?</span>
          <input autoFocus value={accepting} onChange={(e) => setAccepting(e.target.value)} placeholder={donor ? `e.g. ${donor.label} and ${rr?.label} are on different cells` : "e.g. not co-expressed"}
            className="min-w-[14rem] flex-1 rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900" aria-label="reason" />
          <Button size="sm" variant="primary" type="submit" disabled={!accepting.trim()} title={accepting.trim() ? undefined : "say why: the note travels with the panel to the Order page"}>Accept</Button>
          <Button size="sm" variant="ghost" onClick={() => setAccepting(null)}>Cancel</Button>
        </form>
      )}
    </li>
  );
}
