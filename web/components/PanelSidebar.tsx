"use client";
import { useMemo, useState } from "react";
import { LEVELS, LEVEL_LABEL, antibodyChannel, type CloneOption } from "@/lib/data";
import { useHealth, useStore } from "@/lib/store";
import type { PanelModule, PanelRow, PubTarget } from "@/lib/types";
import { ChannelCount } from "./ChannelBudget";
import { InModules } from "./InModules";
import { Button, Pill, cx } from "./ui";

const FREE = "\u0000any"; // clone-select sentinel: let the optimiser choose among every catalogue clone
const LEVEL_TONE = { low: "amber", medium: "slate", high: "teal", very_high: "emerald" } as const;
const HEALTH_TEXT = {
  rose: "text-rose-700 dark:text-rose-300", amber: "text-amber-700 dark:text-amber-300",
  emerald: "text-emerald-700 dark:text-emerald-300", slate: "text-slate-500",
} as const;

export function PanelSidebar() {
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const rows = useStore((s) => s.rows);
  const result = useStore((s) => s.result);
  const balanced = useStore((s) => s.balanced);
  const balancing = useStore((s) => s.balancing);
  const removeRow = useStore((s) => s.removeRow);
  const setLevel = useStore((s) => s.setLevel);
  const setClone = useStore((s) => s.setClone);
  const freeClone = useStore((s) => s.freeClone);
  const lockRow = useStore((s) => s.lockRow);
  const setStep = useStore((s) => s.setStep);
  const step = useStore((s) => s.step);
  const health = useHealth();
  const clearPanel = useStore((s) => s.clearPanel);
  const saved = useStore((s) => s.saved);
  const savePanel = useStore((s) => s.savePanel);
  const loadSavedPanel = useStore((s) => s.loadSavedPanel);
  const deleteSavedPanel = useStore((s) => s.deleteSavedPanel);
  const pubs = useStore((s) => s.pubs);
  const ensurePubs = useStore((s) => s.ensurePubs);
  const [open, setOpen] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [saveName, setSaveName] = useState<string | null>(null); // null = not saving; "" = input open

  const modules = useMemo(() => new Set(rows.flatMap((r) => r.moduleIds)), [rows]);
  const byRow = useMemo(() => new Map(result?.rows.map((r) => [r.rowId, r]) ?? []), [result]);
  const customRows = useMemo(() => new Set([...(health?.custom ?? []), ...(health?.customKnown ?? [])].map((c) => c.rowId)), [health]);
  const channels = idx.instrument(setup.instrumentId).channels;

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <div className="text-sm font-semibold">Your panel</div>
        <div className="flex items-center gap-1">
          {rows.length > 0 && saveName === null && <Button size="sm" variant="ghost" title="Save this panel in this browser" onClick={() => setSaveName("")}>Save</Button>}
          <Button size="sm" variant={showSaved ? "secondary" : "ghost"} title="Panels saved in this browser" onClick={() => setShowSaved((v) => !v)}>Saved{saved.length ? ` (${saved.length})` : ""}</Button>
          {rows.length > 0 && <Button size="sm" variant="ghost" onClick={clearPanel}>Clear</Button>}
        </div>
      </div>
      {saveName !== null && (
        <form className="flex items-center gap-1 border-b border-slate-200 px-3 py-2 dark:border-slate-700" onSubmit={(e) => { e.preventDefault(); if (saveName.trim()) { savePanel(saveName); setSaveName(null); setShowSaved(true); } }}>
          <input autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Panel name" aria-label="Panel name"
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900" />
          <Button size="sm" variant="primary" disabled={!saveName.trim()} onClick={() => { savePanel(saveName); setSaveName(null); setShowSaved(true); }}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setSaveName(null)}>Cancel</Button>
        </form>
      )}
      {showSaved && (
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/50" data-testid="saved-panels">
          {saved.length === 0 && <div className="text-slate-500">No saved panels yet. Saved panels live in this browser only (until accounts arrive); share links work everywhere.</div>}
          <div className="space-y-1">
            {saved.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <button className="min-w-0 flex-1 truncate text-left font-medium hover:underline" title={`${p.summary} · saved ${new Date(p.savedAt).toLocaleString()}`} onClick={() => { loadSavedPanel(p.id); setShowSaved(false); }}>{p.name}</button>
                <span className="shrink-0 text-slate-500">{p.nRows} markers</span>
                <button onClick={() => deleteSavedPanel(p.id)} className="text-slate-400 hover:text-rose-600" title="delete saved panel">×</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800 lg:max-h-[60vh] lg:overflow-y-auto">
        {rows.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-500">Add modules or search for markers.</li>}
        {rows.map((r) => {
          const rr = byRow.get(r.id);
          const opts = r.targetId ? idx.cloneOptions(r.targetId, setup) : [];
          const showMetal = balanced && rr;
          const sev = rr ? (rr.receivedOverT >= 1 ? "rose" : rr.receivedOverT >= 0.5 ? "amber" : "emerald") : "slate";
          return (
            <li key={r.id} className="px-3 py-1.5">
              <div className="flex items-center gap-2">
                <button className="min-w-0 flex-1 truncate text-left font-medium" onClick={() => { setOpen(open === r.id ? null : r.id); ensurePubs(); }} title={r.clone ? `clone ${r.clone}` : "custom conjugation"}>
                  {r.name}
                  {r.targetId && (pubs?.targets[r.targetId]?.n ?? 0) > 0 && <span className="ml-1.5 font-normal text-[10px] text-slate-400" title="CyTOF / IMC papers mentioning this marker (click for the list)">{pubs!.targets[r.targetId].n} papers</span>}
                </button>
                <Pill tone={LEVEL_TONE[r.level]} onClick={() => setLevel(r.id, LEVELS[(LEVELS.indexOf(r.level) + 1) % LEVELS.length])} title="abundance: click to cycle">{LEVEL_LABEL[r.level]}</Pill>
                {showMetal && (
                  rr.mass != null
                    ? <Pill tone={sev} title={`received ${rr.received.toFixed(1)} counts = ${rr.receivedOverT.toFixed(2)} × tolerance${customRows.has(r.id) ? " · * no catalogue vial on this channel: conjugated to order" : ""}`} onClick={() => setOpen(open === r.id ? null : r.id)}>{r.locked != null ? "🔒 " : ""}{rr.channel}{customRows.has(r.id) ? "*" : ""}</Pill>
                    : <Pill tone="rose">no channel</Pill>
                )}
                {!showMetal && r.locked != null && <Pill tone="slate" title="you pinned this marker to this channel" onClick={() => setOpen(open === r.id ? null : r.id)}>🔒 {channels.find((c) => c.mass === r.locked)?.label ?? r.locked}</Pill>}
                {!showMetal && r.locked == null && r.custom && <Pill tone="violet" title="no catalogue conjugate for this setup: custom conjugation">custom</Pill>}
                <button onClick={() => removeRow(r.id)} className="text-slate-400 hover:text-rose-600" title="remove">×</button>
              </div>
              {open === r.id && (
                <RowDetails row={r} clones={opts} channels={channels} rr={rr} balanced={balanced} blocked={setup.blocked}
                  pubs={r.targetId ? pubs?.targets[r.targetId] ?? null : null} modules={r.targetId ? idx.modulesWith(r.targetId, setup) : []}
                  onClone={(c) => (c === FREE ? freeClone(r.id) : setClone(r.id, c))} onLock={(m) => lockRow(r.id, m)} />
              )}
            </li>
          );
        })}
      </ul>
      <div className="space-y-1 border-t border-slate-200 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
        <div><ChannelCount used={rows.length} /> · <b>{modules.size}</b> module{modules.size === 1 ? "" : "s"}</div>
        {health && rows.length > 0 && (
          <button onClick={() => setStep("balance")} data-testid="health" data-tone={health.tone} title={step === "balance" ? undefined : "open Balance"}
            className={cx("block text-left font-medium", step !== "balance" && "underline decoration-dotted underline-offset-2", HEALTH_TEXT[health.tone])}>
            {balancing && !result ? "checking…" : health.headline}
          </button>
        )}
        {balanced && result && <div className="text-slate-400">spillover score {result.objective.toFixed(2)} (lower is better){balancing ? " · updating…" : ""}</div>}
      </div>
    </div>
  );
}

function RowDetails({ row, clones, channels, rr, balanced, blocked, pubs, modules, onClone, onLock }: {
  row: PanelRow; clones: CloneOption[]; pubs: PubTarget | null; modules: PanelModule[]; blocked: number[];
  channels: { mass: number; label: string; usable: boolean; antibody?: boolean }[]; rr: { mass: number | null; reasons: string[]; contributions: { label: string; mass: number; fraction: number; mechanism: string }[] } | undefined;
  balanced: boolean; onClone: (c: string | null) => void; onLock: (m: number | null) => void;
}) {
  const pool = row.clonePinned ? clones.filter((c) => c.clone === row.clone) : clones;
  const allowed = new Set(pool.flatMap((c) => c.conjugates.map((x) => x.mass)));
  const pickable = channels.filter((c) => antibodyChannel(c) && !blocked.includes(c.mass) && (allowed.size === 0 || allowed.has(c.mass)));
  return (
    <div className="mt-1 space-y-2 rounded-md bg-slate-50 p-2 text-xs dark:bg-slate-800">
      {clones.length > 1 && (
        <label className="flex items-center gap-2">
          <span className="text-slate-500">Clone</span>
          <select value={row.clonePinned || !row.clone ? row.clone ?? "" : FREE} onChange={(e) => onClone(e.target.value === FREE ? FREE : e.target.value || null)} className="rounded border border-slate-300 bg-white px-1 py-0.5 dark:border-slate-600 dark:bg-slate-900" data-testid="clone-select">
            <option value={FREE}>any clone — optimiser picks{row.clone && !row.clonePinned ? ` (now ${row.clone})` : ""}</option>
            {clones.map((c) => <option key={c.clone} value={c.clone}>{c.clone} · {c.metals.length} metal{c.metals.length > 1 ? "s" : ""}{c.sampleValidated ? " · validated" : ""} · {c.reactivity.join("/")}</option>)}
            <option value="">custom conjugation</option>
          </select>
        </label>
      )}
      {clones.length > 1 && !row.clonePinned && row.clone && <div className="text-slate-500">Clone {row.clone} this time; the optimiser may switch to another catalogue clone when the panel changes. Pick one above to keep it.</div>}
      {clones.length === 1 && <div className="text-slate-500">Clone {clones[0].clone} · {clones[0].reactivity.join("/")} · {clones[0].tds && <a className="underline" href={clones[0].tds} target="_blank" rel="noreferrer">TDS</a>}</div>}
      {clones.length === 0 && <div className="text-violet-700 dark:text-violet-300">No catalogue conjugate for this species/application: custom conjugation with the Maxpar X8 kit (any lanthanide).</div>}
      {(balanced || row.custom) && (
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-slate-500">{clones.length === 0 ? "Metal" : "Channel"}</span>
          <select value={row.locked ?? ""} onChange={(e) => onLock(e.target.value ? Number(e.target.value) : null)} className="rounded border border-slate-300 bg-white px-1 py-0.5 dark:border-slate-600 dark:bg-slate-900">
            <option value="">{clones.length === 0 ? "not labelled yet — let the optimiser choose" : "let the optimiser choose"}{rr?.mass != null ? ` (${channels.find((c) => c.mass === rr.mass)?.label})` : ""}</option>
            {pickable.map((c) => <option key={c.mass} value={c.mass}>{clones.length === 0 ? `already labelled with ${c.label}` : `lock to ${c.label}`}</option>)}
          </select>
        </label>
      )}
      {clones.length === 0 && row.locked == null && (
        <div className="text-slate-500">Already have this antibody conjugated? Pick its metal above and the balancer will work around it.</div>
      )}
      {modules.length > 0 && <InModules modules={modules} max={3} />}
      {balanced && rr && rr.reasons.length > 0 && <ul className="list-disc space-y-0.5 pl-4 text-slate-600 dark:text-slate-300">{rr.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      {balanced && rr && rr.contributions.length > 0 && (
        <div className="text-slate-500">Receives from: {rr.contributions.slice(0, 4).map((c) => `${c.label} (${c.mass}, ${c.mechanism}, ${(c.fraction * 100).toFixed(0)}% of tolerance)`).join("; ")}</div>
      )}
      {pubs && pubs.n > 0 && <Papers pubs={pubs} />}
    </div>
  );
}

/** Papers from the literature DB that mention this marker in a CyTOF / IMC abstract (see etl/pd3_etl/pubs.py). */
function Papers({ pubs }: { pubs: PubTarget }) {
  const [more, setMore] = useState(false);
  const works = more ? pubs.works : pubs.works.slice(0, 3);
  const tech = Object.entries(pubs.by_technique).map(([k, n]) => `${n} ${k === "imc" ? "IMC" : "CyTOF"}`).join(" · ");
  return (
    <div data-testid="papers">
      <div className="text-slate-500"><b>{pubs.n}</b> paper{pubs.n === 1 ? "" : "s"} mention this marker ({tech}, by abstract)</div>
      <ul className="mt-1 space-y-0.5">
        {works.map((w) => (
          <li key={w.id} className="truncate" title={`${w.title}${w.venue ? ` · ${w.venue}` : ""} (${w.year ?? "n.d."}) · ${w.cited} citations`}>
            {w.doi ? <a className="underline" href={`https://doi.org/${w.doi}`} target="_blank" rel="noreferrer">{w.title}</a> : w.title}
            <span className="ml-1 text-slate-400">{w.year ?? ""}</span>
          </li>
        ))}
      </ul>
      {pubs.works.length > 3 && <button className="mt-0.5 text-teal-700 underline dark:text-teal-300" onClick={() => setMore((v) => !v)}>{more ? "fewer" : `${pubs.works.length - 3} more`}</button>}
    </div>
  );
}
