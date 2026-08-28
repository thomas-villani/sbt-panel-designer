"use client";
import { useMemo, useRef, useState } from "react";
import { markerPlan, normKey } from "@/lib/data";
import { useHealth, useStore } from "@/lib/store";
import type { ModuleMarker, PanelModule, Target } from "@/lib/types";
import { BrowseAll } from "./BrowseAll";
import { ChannelCount } from "./ChannelBudget";
import { InModules } from "./InModules";
import { Button, Card, H2, Pill, cx } from "./ui";

const CATEGORY_LABEL: Record<string, string> = {
  celltype: "Cell types", lineage: "Lineage", functional: "Functional state", tissue: "Tissue", structural: "Tissue structure", disease: "Disease-specific", assay: "Complete assays / kits", scaffolding: "Cell ID & controls",
};
const CATEGORY_ORDER = ["lineage", "celltype", "functional", "tissue", "structural", "assay", "disease", "scaffolding"];

const markerLabel = (k: ModuleMarker) => k.target_name + (k.polarity === "neg" ? "−" : "");
const rowIdOf = (k: ModuleMarker) => k.target_id ?? `custom:${k.target_name}`;

export function BuildStep() {
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const rows = useStore((s) => s.rows);
  const addModule = useStore((s) => s.addModule);
  const removeModule = useStore((s) => s.removeModule);
  const addTarget = useStore((s) => s.addTarget);
  const addCustom = useStore((s) => s.addCustom);
  const setStep = useStore((s) => s.setStep);
  const balanced = useStore((s) => s.balanced);
  const pubs = useStore((s) => s.pubs);
  const ensurePubs = useStore((s) => s.ensurePubs);
  const health = useHealth();
  const left = health ? Math.max(0, health.budget - rows.length) : Infinity; // channels still free
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0); // highlighted result (keyboard); reset when the query changes
  // Results register themselves in render order, so Arrow keys and Enter act on what the user sees.
  const picks = useRef<(() => void)[]>([]);
  picks.current = [];
  // The highlight follows the pointer only when it really moves: a list that opens under an idle mouse must not
  // steal the highlight from the keyboard (browsers synthesise mouseenter on layout changes).
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const option = (pick: (() => void) | null) => {
    const i = picks.current.push(pick ?? (() => {})) - 1;
    const onMouseMove = (e: React.MouseEvent) => {
      const last = pointer.current;
      pointer.current = { x: e.clientX, y: e.clientY };
      if (last && (last.x !== e.clientX || last.y !== e.clientY) && i !== active) setActive(i);
    };
    return { id: `search-option-${i}`, role: "option" as const, "aria-selected": i === active, onMouseMove, "data-active": i === active ? "" : undefined };
  };
  const search = (value: string) => { setQ(value); setActive(0); };
  const [cat, setCat] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null); // "show me everything matching io / neuro"
  const [browse, setBrowse] = useState(false);

  const modality = setup.modality === "imaging" ? "IMC" : "CyTOF";
  const modules = useMemo(() => idx.modulesFor(setup), [idx, setup]);
  const catalogue = useMemo(() => idx.allTargets(setup), [idx, setup]);
  const have = useMemo(() => new Set(rows.map((r) => r.targetId)), [rows]);
  const hits = useMemo(() => idx.search(q, setup), [idx, q, setup]);
  const moduleHitsAll = useMemo(() => (q.includes(",") ? [] : idx.searchModules(q, setup, 100)), [idx, q, setup]);
  const moduleHits = moduleHitsAll.slice(0, 6);
  const topicHits = useMemo(() => (topic ? idx.searchModules(topic, setup, 100) : null), [idx, topic, setup]);
  // Nothing for this modality? Show what exists elsewhere, disabled, so "NK cells" never dead-ends on a custom-conjugation offer.
  const otherHits = useMemo(() => (q.includes(",") || moduleHits.length ? [] : idx.searchModules(q, setup, 3, true)), [idx, q, setup, moduleHits]);
  // A cell type typed by name ("NK cells") beats a marker; a marker typed by name ("CD4") beats the "CD4 helper T cells" module.
  const modulesFirst = !hits.length || moduleHits.some((m) => [m.name, ...m.aliases].some((a) => normKey(a) === normKey(q)));
  const suggestions = useMemo(() => idx.suggestNext(rows, setup), [idx, rows, setup]);
  const cats = CATEGORY_ORDER.filter((c) => modules.some((m) => m.category === c));
  const visible = (topicHits ?? modules).filter((m) => m.category !== "scaffolding" && (topicHits ? true : !cat || m.category === cat));

  const isAdded = (m: PanelModule) => rows.some((r) => r.moduleIds.includes(m.id));
  const inPanel = (k: ModuleMarker) => rows.some((r) => r.id === rowIdOf(k));
  /** Markers the module would add under this setup and how many are already in the panel from elsewhere. */
  const coverage = (m: PanelModule) => {
    const adds = m.markers.filter((k) => markerPlan(k, setup) !== "skip");
    const missing = adds.filter((k) => !inPanel(k));
    return { n: adds.length - missing.length, total: adds.length, missing };
  };
  const paperCount = (targetId: string) => pubs?.targets[targetId]?.n ?? 0;

  const pasteList = () => {
    const names = q.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (names.length < 2) return;
    for (const n of names) {
      const t = idx.search(n, setup, 1)[0];
      if (t) addTarget(t.id); else addCustom(n);
    }
    setQ("");
  };
  const pickActive = () => { picks.current[active]?.(); };
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = picks.current.length;
    if (e.key === "ArrowDown" && n) { e.preventDefault(); setActive((i) => (i + 1) % n); }
    else if (e.key === "ArrowUp" && n) { e.preventDefault(); setActive((i) => (i - 1 + n) % n); }
    else if (e.key === "Enter") { e.preventDefault(); pickActive(); }
    else if (e.key === "Escape" && q) { e.preventDefault(); search(""); }
  };

  const moduleHit = (m: PanelModule) => {
    const added = isAdded(m);
    const cov = coverage(m);
    return (
      <button key={m.id} disabled={added} onClick={() => { addModule(m); search(""); }} data-testid="module-hit" {...option(added ? null : () => { addModule(m); search(""); })}
        className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-teal-50 disabled:opacity-50 data-[active]:bg-teal-50 dark:border-slate-800 dark:hover:bg-slate-800 dark:data-[active]:bg-slate-800">
        <span className="min-w-0">
          <span className="font-medium">{m.name}</span>
          <Pill tone="teal" className="ml-2">{m.category === "celltype" ? "cell type" : "marker set"}</Pill>
          <span className="mt-0.5 block truncate text-xs text-slate-600 dark:text-slate-400">{m.definition ?? m.markers.filter((k) => markerPlan(k, setup) !== "skip").map(markerLabel).join(", ")}</span>
        </span>
        <span className={cx("hidden max-w-[45%] shrink-0 truncate text-xs sm:block", !added && cov.missing.length > left ? "text-rose-700 dark:text-rose-300" : "text-slate-600 dark:text-slate-400")}>{added ? "added" : cov.missing.length === 0 ? "all in panel" : cov.missing.length > left ? `needs ${cov.missing.length} channels, ${left === 0 ? "none" : `only ${left}`} left` : `adds ${cov.missing.map(markerLabel).join(", ")}`}</span>
      </button>
    );
  };
  const targetHit = (t: Target) => {
    const opts = idx.cloneOptions(t.id, setup);
    const added = have.has(t.id);
    const np = paperCount(t.id);
    const inModules = idx.modulesWith(t.id, setup).filter((m) => m.category !== "scaffolding");
    return (
      <div key={t.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
        <button disabled={added} onClick={() => { addTarget(t.id); search(""); }} {...option(added ? null : () => { addTarget(t.id); search(""); })}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50 data-[active]:bg-slate-50 dark:hover:bg-slate-800 dark:data-[active]:bg-slate-800">
          <span className="min-w-0"><span className="font-medium">{t.name}</span>{t.aliases.length > 0 && <span className="ml-2 text-xs text-slate-600 dark:text-slate-400">{t.aliases.slice(0, 3).join(" · ")}</span>}</span>
          <span className="shrink-0 text-xs text-slate-600 dark:text-slate-400">
            {np > 0 && <span className="mr-2 rounded bg-slate-100 px-1 text-[10px] dark:bg-slate-800" title="CyTOF / IMC papers mentioning this marker">{np} paper{np > 1 ? "s" : ""}</span>}
            {added ? "added" : opts.length ? `${opts.length} clone${opts.length > 1 ? "s" : ""} · ${new Set(opts.flatMap((o) => o.metals)).size} metals` : "custom conjugation"}
          </span>
        </button>
        {inModules.length > 0 && <div className="px-3 pb-2"><InModules modules={inModules} onAdd={() => setQ("")} /></div>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {health && health.over > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm dark:border-rose-800 dark:bg-rose-950" data-testid="over-budget">
          <span className="flex-1"><b>{rows.length} markers, {health.budget} channels.</b> The {idx.instrument(setup.instrumentId).name} cannot hold this panel: drop {health.over} marker{health.over > 1 ? "s" : ""}, or let Balance suggest which.</span>
          <Button size="sm" variant="primary" onClick={() => setStep("balance")}>Suggest what to drop →</Button>
        </div>
      )}
      {health && health.over === 0 && left <= 3 && rows.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950" data-testid="near-budget">
          {left === 0 ? "Every antibody channel is spoken for. Adding more means dropping something." : `${left} channel${left > 1 ? "s" : ""} left.`}
        </div>
      )}
      <section>
        <H2 hint="type a marker, an alias (PD-L1 finds CD274), a cell type (dendritic cells) or paste a comma-separated list">Add a marker or cell type</H2>
        <div className="relative">
          <input value={q} onChange={(e) => search(e.target.value)} onFocus={ensurePubs} placeholder="e.g. CD8a, FoxP3, granzyme, NK cells…" autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done"
            role="combobox" aria-label="Add a marker or cell type" aria-expanded={!!q} aria-controls="search-results" aria-autocomplete="list" aria-activedescendant={q ? `search-option-${active}` : undefined}
            onKeyDown={onSearchKey}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-teal-500 dark:border-slate-600 dark:bg-slate-900" />
          {q && (
            <div id="search-results" role="listbox" aria-label="Search results" className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {q.includes(",") && <button onClick={pasteList} {...option(pasteList)} className="block w-full px-3 py-2 text-left text-sm font-medium text-teal-700 hover:bg-slate-50 data-[active]:bg-slate-50 dark:hover:bg-slate-800 dark:data-[active]:bg-slate-800">Add all {q.split(/[,;\n]+/).filter((s) => s.trim()).length} markers from this list</button>}
              {modulesFirst && moduleHits.map(moduleHit)}
              {hits.map(targetHit)}
              {!modulesFirst && moduleHits.map(moduleHit)}
              {moduleHitsAll.length > 2 && (
                <button onClick={() => { setTopic(q); search(""); }} data-testid="show-all-modules" {...option(() => { setTopic(q); search(""); })}
                  className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm font-medium text-teal-700 hover:bg-slate-50 data-[active]:bg-slate-50 dark:border-slate-800 dark:text-teal-300 dark:hover:bg-slate-800 dark:data-[active]:bg-slate-800">
                  Show all {moduleHitsAll.length} panels matching “{q}” as cards
                </button>
              )}
              {otherHits.map((m) => (
                <div key={m.id} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-400 dark:border-slate-800" data-testid="module-hit-other">
                  <span className="min-w-0"><span className="font-medium">{m.name}</span>
                    <Pill tone="slate" className="ml-2">{m.application === "both" ? `not available for ${modality}` : m.application === "imaging" ? "tissue imaging only" : "suspension only"}</Pill>
                    <span className="mt-0.5 block truncate text-xs">{m.definition}</span></span>
                  <span className="shrink-0 text-xs">this one needs markers that are not sold for {modality}; switch modality in Setup, or add the markers you do want one by one</span>
                </div>
              ))}
              {!hits.length && !moduleHits.length && !q.includes(",") && (
                <button onClick={() => { addCustom(q.trim()); search(""); }} {...option(() => { addCustom(q.trim()); search(""); })} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 data-[active]:bg-slate-50 dark:hover:bg-slate-800 dark:data-[active]:bg-slate-800">
                  No catalogue antibody for “{q}” — add as a <span className="font-medium">custom conjugation</span> (you supply the antibody; Maxpar X8 labelling)
                </button>
              )}
            </div>
          )}
        </div>
        <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          Not sure what exists?{" "}
          <button onClick={() => setBrowse((v) => !v)} data-testid="browse-toggle" className="font-medium text-teal-700 underline dark:text-teal-300">
            {browse ? "Hide the marker list" : `Browse all ${catalogue.length} markers available for ${modality}`}
          </button>
        </div>
      </section>

      {browse && <BrowseAll onClose={() => setBrowse(false)} />}

      {suggestions.length > 0 && (
        <section>
          <H2 hint="from marker sets that overlap your panel">Suggested next</H2>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => <Pill key={s.targetId} tone="teal" onClick={() => addTarget(s.targetId)} title={s.reason}>+ {s.name}<span className="ml-1 font-normal opacity-70">{s.reason}</span></Pill>)}
          </div>
        </section>
      )}

      <section>
        <H2 hint={topicHits ? `${visible.length} of ${modules.length} sets match` : `${modules.length} marker sets for ${setup.modality} · ${setup.species}`}>
          {topic ? <span className="flex flex-wrap items-center gap-2">Panels matching “{topic}”<Button size="sm" variant="ghost" onClick={() => setTopic(null)}>clear</Button></span> : "Start from a marker set or a cell type"}
        </H2>
        {!topic && (
          <div className="mb-3 flex flex-wrap gap-1">
            <Button size="sm" variant={cat ? "ghost" : "secondary"} onClick={() => setCat(null)}>All</Button>
            {cats.filter((c) => c !== "scaffolding").map((c) => <Button key={c} size="sm" variant={cat === c ? "secondary" : "ghost"} onClick={() => setCat(c)}>{CATEGORY_LABEL[c] ?? c}</Button>)}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visible.map((m) => {
            const added = isAdded(m);
            const cov = coverage(m);
            // Only what the module actually contributes is listed. Markers with nothing sold for this modality are left
            // out silently: a struck-through marker reads as "you are paying for something you will not get".
            const markers = m.markers.filter((k) => k.kind === "antibody" && markerPlan(k, setup) !== "skip");
            const nCustom = markers.filter((k) => markerPlan(k, setup) === "custom").length;
            const hasNeg = markers.some((k) => k.polarity === "neg");
            const nMissing = cov.missing.length;
            return (
              <Card key={m.id} active={added} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium leading-tight">{m.name}</div>
                    {m.definition && <div className="mt-0.5 font-mono text-[11px] text-teal-800 dark:text-teal-200">{m.definition}</div>}
                    <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{m.blurb}</div>
                  </div>
                  {m.source === "sbt_kit" && <Pill tone="violet" title="Sold as a kit by Standard BioTools">SBT kit</Pill>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {markers.slice(0, 14).map((k) => {
                    const neg = k.polarity === "neg";
                    const custom = markerPlan(k, setup) === "custom";
                    const title = custom ? `${k.role} · no catalogue conjugate for ${modality}: goes in as a custom conjugation`
                      : neg ? `${k.role} · lineage negative: separates this cell type from its neighbours` : k.role;
                    return (
                      <span key={rowIdOf(k)} title={title}
                        className={cx("rounded px-1.5 py-0.5 text-[11px]", inPanel(k) ? "bg-teal-100 text-teal-900 dark:bg-teal-900 dark:text-teal-100" : custom ? "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-100" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", neg && "border border-dashed border-slate-400")}>
                        {markerLabel(k)}{custom && "*"}
                      </span>
                    );
                  })}
                  {markers.length > 14 && <span className="text-[11px] text-slate-600 dark:text-slate-400">+{markers.length - 14} more</span>}
                </div>
                {(hasNeg || nCustom > 0) && (
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    {hasNeg && "Dashed = lineage negative, added so the gate stays clean. "}
                    {nCustom > 0 && `* = conjugated to order (custom conjugation), not an off-the-shelf vial.`}
                  </div>
                )}
                <div className="mt-auto flex items-center justify-between gap-2">
                  <span className={cx("text-xs", !added && nMissing > left ? "text-rose-700 dark:text-rose-300" : "text-slate-600 dark:text-slate-400")}>
                    {added ? `${cov.n}/${cov.total} in panel`
                      : nMissing > left ? `needs ${nMissing} channel${nMissing === 1 ? "" : "s"}, ${left === 0 ? "none" : `only ${left}`} left`
                        : cov.n === 0 ? `${cov.total} marker${cov.total === 1 ? "" : "s"}` : nMissing === 0 ? "all targets already in panel" : `${cov.n} of ${cov.total} already in panel`}
                  </span>
                  {added
                    ? <Button size="sm" variant="danger" onClick={() => removeModule(m.id)}>Remove</Button>
                    : nMissing === 0
                      ? <Button size="sm" variant="secondary" title="Every marker is already in your panel; tag them as this set" onClick={() => addModule(m)}>Tag as set</Button>
                      : <Button size="sm" variant={nMissing > left ? "secondary" : "primary"} title={nMissing > left ? "This will push the panel over the channel budget; you can still add it and trim afterwards." : undefined} onClick={() => addModule(m)}>Add {nMissing} marker{nMissing === 1 ? "" : "s"}{nMissing > left ? " anyway" : ""}</Button>}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button variant="primary" size="lg" disabled={!rows.length} onClick={() => setStep("balance")}>{balanced ? "Back to balance →" : "Balance panel →"}</Button>
        <ChannelCount used={rows.length} className="text-sm text-slate-600 dark:text-slate-400" />
      </div>
    </div>
  );
}
