"use client";
import { useMemo, useState } from "react";
import { LEVELS, LEVEL_LABEL, antibodyChannel, kitSupplies, reservedRoles, type CloneOption } from "@/lib/data";
import { SPILL_CRIT, SPILL_WARN } from "@pd3/engine";
import { useHealth, useStore } from "@/lib/store";
import type { PanelModule, PanelRow, PubTarget } from "@/lib/types";
import { ChannelCount } from "./ChannelBudget";
import { InModules } from "./InModules";
import { Button, Pill, cx } from "./ui";

const FREE = "\u0000any"; // clone-select sentinel: let the optimiser choose among every catalogue clone
const LEVEL_TONE = { low: "amber", medium: "slate", high: "teal", very_high: "emerald" } as const;
const HEALTH_TEXT = {
  rose: "text-rose-700 dark:text-rose-300", amber: "text-amber-700 dark:text-amber-300",
  emerald: "text-emerald-700 dark:text-emerald-300", slate: "text-slate-600 dark:text-slate-400",
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
  const [confirmNew, setConfirmNew] = useState(false);
  const [sortBy, setSortBy] = useState<"added" | "name" | "mass">("added");

  const modules = useMemo(() => new Set(rows.flatMap((r) => r.moduleIds)), [rows]);
  const byRow = useMemo(() => new Map(result?.rows.map((r) => [r.rowId, r]) ?? []), [result]);
  const customRows = useMemo(() => new Set([...(health?.custom ?? []), ...(health?.customKnown ?? [])].map((c) => c.rowId)), [health]);
  const channels = idx.instrument(setup.instrumentId).channels;
  const reservedMasses = useMemo(() => {
    const roles = reservedRoles(setup);
    return new Set(idx.instruments.reserved[setup.modality].filter((r) => roles.includes(r.role)).flatMap((r) => r.masses));
  }, [idx, setup]);
  const occupied = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rows) if (r.locked != null) m.set(r.locked, r.name);
    if (balanced && result) for (const r of result.rows) if (r.mass != null && !m.has(r.mass)) m.set(r.mass, r.label);
    return m;
  }, [rows, result, balanced]);
  const sorted = useMemo(() => {
    if (sortBy === "added") return rows;
    const massOf = (r: PanelRow) => byRow.get(r.id)?.mass ?? r.locked ?? Infinity;
    return [...rows].sort((a, b) => (sortBy === "name" ? a.name.localeCompare(b.name, undefined, { numeric: true }) : massOf(a) - massOf(b) || a.name.localeCompare(b.name)));
  }, [rows, sortBy, byRow]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <div className="text-sm font-semibold">Your panel</div>
        <div className="flex items-center gap-1">
          {rows.length > 0 && saveName === null && <Button size="sm" variant="ghost" title="Save this panel in this browser" onClick={() => setSaveName("")}>Save</Button>}
          <Button size="sm" variant={showSaved ? "secondary" : "ghost"} title="Panels saved in this browser" onClick={() => setShowSaved((v) => !v)}>Saved panels{saved.length ? ` (${saved.length})` : ""}</Button>
          <Button size="sm" variant="ghost" title="Start a new panel" onClick={() => (rows.length ? setConfirmNew(true) : clearPanel())} data-testid="new-panel">New</Button>
        </div>
      </div>
      {confirmNew && (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs dark:border-amber-800 dark:bg-amber-950" data-testid="confirm-new">
          <span className="flex-1">Start a new panel? The current one ({rows.length} markers) will be cleared.</span>
          <Button size="sm" variant="secondary" onClick={() => { setConfirmNew(false); setSaveName(""); }}>Save it first</Button>
          <Button size="sm" variant="danger" onClick={() => { setConfirmNew(false); clearPanel(); }}>New panel</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmNew(false)}>Cancel</Button>
        </div>
      )}
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
          {saved.length === 0 && <div className="text-slate-600 dark:text-slate-400">No saved panels yet. Saved panels live in this browser only (until accounts arrive); share links work everywhere.</div>}
          <div className="space-y-1">
            {saved.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <button className="min-w-0 flex-1 truncate text-left font-medium hover:underline" title={`${p.summary} · saved ${new Date(p.savedAt).toLocaleString()}`} onClick={() => { loadSavedPanel(p.id); setShowSaved(false); }}>{p.name}</button>
                <span className="shrink-0 text-slate-600 dark:text-slate-400">{p.nRows} markers</span>
                <button onClick={() => deleteSavedPanel(p.id)} className="text-slate-400 hover:text-rose-600" title="delete saved panel">×</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {rows.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1 text-[11px] text-slate-600 dark:text-slate-400">
          <span>Sort</span>
          {(["added", "name", "mass"] as const).map((k) => (
            <button key={k} onClick={() => setSortBy(k)} disabled={k === "mass" && !balanced} title={k === "mass" && !balanced ? "available once the panel has been balanced" : undefined}
              className={cx("rounded px-1.5 py-0.5 disabled:opacity-40", sortBy === k ? "bg-slate-200 font-medium text-slate-900 dark:bg-slate-700 dark:text-slate-50" : "hover:bg-slate-100 dark:hover:bg-slate-800")}>
              {k === "added" ? "as added" : k === "name" ? "name" : "metal"}
            </button>
          ))}
        </div>
      )}
      <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800 lg:max-h-[60vh] lg:overflow-y-auto" data-testid="panel-rows">
        {rows.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-600 dark:text-slate-400">Add a marker set or search for markers.</li>}
        {sorted.map((r) => {
          const rr = byRow.get(r.id);
          const opts = r.targetId ? idx.cloneOptions(r.targetId, setup) : [];
          const showMetal = balanced && rr;
          const sev = rr ? (rr.receivedOverT >= SPILL_CRIT ? "rose" : rr.receivedOverT >= SPILL_WARN ? "amber" : "emerald") : "slate";
          return (
            <li key={r.id} className="px-3 py-1.5">
              <div className="flex items-center gap-2">
                <button className="min-w-0 flex-1 truncate text-left font-medium" onClick={() => { setOpen(open === r.id ? null : r.id); ensurePubs(); }} title={r.clone ? `clone ${r.clone}` : "custom conjugation"}>
                  {r.name}
                  {r.targetId && (pubs?.targets[r.targetId]?.n ?? 0) > 0 && <span className="ml-1.5 font-normal text-[10px] text-slate-500 dark:text-slate-400" title="CyTOF / IMC papers mentioning this marker (click for the list)">{pubs!.targets[r.targetId].n} papers</span>}
                </button>
                <Pill tone={LEVEL_TONE[r.level]} onClick={() => setLevel(r.id, LEVELS[(LEVELS.indexOf(r.level) + 1) % LEVELS.length])} title="abundance: click to cycle">{LEVEL_LABEL[r.level]}</Pill>
                <MetalPick row={r} clones={opts} channels={channels} occupied={occupied} blocked={[...setup.blocked, ...reservedMasses]} extraMetals={setup.extraMetals} mass={showMetal ? rr.mass : null} balanced={!!showMetal}
                  tone={showMetal ? (rr.mass != null ? sev : "rose") : r.locked != null ? "slate" : r.custom ? "violet" : "slate"}
                  title={showMetal && rr.mass != null ? `received ${rr.received.toFixed(1)} counts = ${rr.receivedOverT.toFixed(2)} × tolerance${customRows.has(r.id) ? " · * no catalogue vial on this channel: conjugated to order" : ""} — click to change the metal` : r.locked != null ? (kitSupplies(idx, r, r.locked) ? "the metal this marker ships with in its kit — click to change (the kit vial then goes unused)" : "you pinned this marker to this channel — click to change") : r.custom ? "no catalogue conjugate for this setup: custom conjugation — click to pick the metal" : "click to pick a metal by hand"}
                  star={customRows.has(r.id)} onLock={(m) => lockRow(r.id, m)} />
                <button onClick={() => removeRow(r.id)} className="text-slate-400 hover:text-rose-600" title="remove">×</button>
              </div>
              {open === r.id && (
                <RowDetails row={r} clones={opts} channels={channels} rr={rr} balanced={balanced} blocked={setup.blocked} extraMetals={setup.extraMetals}
                  pubs={r.targetId ? pubs?.targets[r.targetId] ?? null : null} modules={r.targetId ? idx.modulesWith(r.targetId, setup) : []}
                  onClone={(c) => (c === FREE ? freeClone(r.id) : setClone(r.id, c))} onLock={(m) => lockRow(r.id, m)} />
              )}
            </li>
          );
        })}
      </ul>
      <div className="space-y-1 border-t border-slate-200 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
        <div><ChannelCount used={rows.length} /> · <b>{modules.size}</b> set{modules.size === 1 ? "" : "s"}</div>
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

const PICK_TONE = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200", amber: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
  rose: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100", emerald: "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-100",
} as const;

/**
 * The metal, as a pill you can open: pick any channel the clone can be conjugated to (open ones first, then a swap
 * with whoever holds it) or hand it back to the optimiser. Works before the first balance too.
 */
function MetalPick({ row, clones, channels, occupied, blocked, extraMetals, mass, balanced, tone, title, star, onLock }: {
  row: PanelRow; clones: CloneOption[]; channels: { mass: number; label: string; usable: boolean; antibody?: boolean }[]; occupied: Map<number, string>;
  blocked: number[]; extraMetals?: number[]; mass: number | null; balanced: boolean; tone: keyof typeof PICK_TONE; title: string; star: boolean; onLock: (m: number | null) => void;
}) {
  const pool = row.clonePinned ? clones.filter((c) => c.clone === row.clone) : clones;
  const allowed = new Set(pool.flatMap((c) => c.conjugates.map((x) => x.mass)));
  const usable = channels.filter((c) => antibodyChannel(c, { extraMetals }) && !blocked.includes(c.mass)).sort((a, b) => a.mass - b.mass);
  const pickable = usable.filter((c) => allowed.size === 0 || allowed.has(c.mass));
  const free = pickable.filter((c) => !occupied.has(c.mass) || c.mass === row.locked);
  const taken = pickable.filter((c) => occupied.has(c.mass) && c.mass !== row.locked);
  // Channels no catalogue vial of this clone covers: still pickable, as a custom conjugation of your own.
  const custom = usable.filter((c) => allowed.size > 0 && !allowed.has(c.mass));
  const label = mass != null ? channels.find((c) => c.mass === mass)?.label ?? String(mass)
    : row.locked != null ? channels.find((c) => c.mass === row.locked)?.label ?? String(row.locked)
      : balanced ? "no channel" : row.custom ? "custom" : "any metal";
  return (
    <span className={cx("relative inline-flex items-center rounded-full py-0.5 pl-2 pr-1.5 text-xs font-medium whitespace-nowrap hover:ring-2 ring-offset-1 ring-teal-400", PICK_TONE[tone])} title={title}>
      <span>{row.locked != null ? "🔒 " : ""}{label}{star ? "*" : ""}</span><span className="ml-1 text-[9px] opacity-70">▾</span>
      <select value={row.locked ?? ""} onChange={(e) => onLock(e.target.value ? Number(e.target.value) : null)} aria-label={`metal for ${row.name}`} data-testid="metal-pick"
        className="absolute inset-0 w-full cursor-pointer opacity-0">
        <option value="">{balanced && mass != null ? `let the optimiser choose (now ${label})` : "let the optimiser choose"}</option>
        {free.length > 0 && <optgroup label="Open channels">{free.map((c) => <option key={c.mass} value={c.mass}>{c.label}</option>)}</optgroup>}
        {taken.length > 0 && <optgroup label="Swap with…">{taken.map((c) => <option key={c.mass} value={c.mass}>{c.label} · now {occupied.get(c.mass)}</option>)}</optgroup>}
        {custom.length > 0 && <optgroup label="Custom conjugation (your own vial)">{custom.map((c) => <option key={c.mass} value={c.mass}>{c.label}{occupied.has(c.mass) ? ` · now ${occupied.get(c.mass)}` : ""}</option>)}</optgroup>}
      </select>
    </span>
  );
}

function RowDetails({ row, clones, channels, rr, balanced, blocked, extraMetals, pubs, modules, onClone, onLock }: {
  row: PanelRow; clones: CloneOption[]; pubs: PubTarget | null; modules: PanelModule[]; blocked: number[]; extraMetals?: number[];
  channels: { mass: number; label: string; usable: boolean; antibody?: boolean }[]; rr: { mass: number | null; reasons: string[]; contributions: { label: string; mass: number; fraction: number; mechanism: string }[] } | undefined;
  balanced: boolean; onClone: (c: string | null) => void; onLock: (m: number | null) => void;
}) {
  const pool = row.clonePinned ? clones.filter((c) => c.clone === row.clone) : clones;
  const allowed = new Set(pool.flatMap((c) => c.conjugates.map((x) => x.mass)));
  const pickable = channels.filter((c) => antibodyChannel(c, { extraMetals }) && !blocked.includes(c.mass) && (allowed.size === 0 || allowed.has(c.mass)));
  return (
    <div className="mt-1 space-y-2 rounded-md bg-slate-50 p-2 text-xs dark:bg-slate-800">
      {clones.length > 1 && (
        <label className="flex items-center gap-2">
          <span className="text-slate-600 dark:text-slate-400">Clone</span>
          <select value={row.clonePinned || !row.clone ? row.clone ?? "" : FREE} onChange={(e) => onClone(e.target.value === FREE ? FREE : e.target.value || null)} className="rounded border border-slate-300 bg-white px-1 py-0.5 dark:border-slate-600 dark:bg-slate-900" data-testid="clone-select">
            <option value={FREE}>any clone — optimiser picks{row.clone && !row.clonePinned ? ` (now ${row.clone})` : ""}</option>
            {clones.map((c) => <option key={c.clone} value={c.clone}>{c.clone} · {c.metals.length} metal{c.metals.length > 1 ? "s" : ""}{c.sampleValidated ? " · validated" : ""} · {c.reactivity.join("/")}</option>)}
            <option value="">custom conjugation</option>
          </select>
        </label>
      )}
      {clones.length > 1 && !row.clonePinned && row.clone && <div className="text-slate-600 dark:text-slate-400">Clone {row.clone} this time; the optimiser may switch to another catalogue clone when the panel changes. Pick one above to keep it.</div>}
      {clones.length === 1 && <div className="text-slate-600 dark:text-slate-400">Clone {clones[0].clone} · {clones[0].reactivity.join("/")} · {clones[0].tds && <a className="underline" href={clones[0].tds} target="_blank" rel="noreferrer">TDS</a>}</div>}
      {clones.length === 0 && <div className="text-violet-700 dark:text-violet-300">No catalogue conjugate for this species/application: custom conjugation with the Maxpar X8 kit (any lanthanide).</div>}
      {clones.length === 0 && row.locked == null && (
        <div className="text-slate-600 dark:text-slate-400">Already have this antibody conjugated? Pick its metal from the pill on the right and the balancer will work around it.</div>
      )}
      {row.locked != null && <div className="text-slate-600 dark:text-slate-400">Pinned to {channels.find((c) => c.mass === row.locked)?.label ?? row.locked}; choose “let the optimiser choose” on the pill to free it.</div>}
      {modules.length > 0 && <InModules modules={modules} max={3} />}
      {balanced && rr && rr.reasons.length > 0 && <ul className="list-disc space-y-0.5 pl-4 text-slate-600 dark:text-slate-300">{rr.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      {balanced && rr && rr.contributions.length > 0 && (
        <div className="text-slate-600 dark:text-slate-400">Receives from: {rr.contributions.slice(0, 4).map((c) => `${c.label} (${c.mass}, ${c.mechanism}, ${(c.fraction * 100).toFixed(0)}% of tolerance)`).join("; ")}</div>
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
      <div className="text-slate-600 dark:text-slate-400"><b>{pubs.n}</b> paper{pubs.n === 1 ? "" : "s"} mention this marker ({tech}, by abstract)</div>
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
