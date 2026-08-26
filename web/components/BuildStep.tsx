"use client";
import { useMemo, useState } from "react";
import { markerPlan, normKey } from "@/lib/data";
import { useStore, useBudget } from "@/lib/store";
import type { ModuleMarker, PanelModule, Target } from "@/lib/types";
import { Button, Card, H2, Pill, cx } from "./ui";

const CATEGORY_LABEL: Record<string, string> = {
  celltype: "Cell types", lineage: "Lineage", functional: "Functional state", tissue: "Tissue", disease: "Disease-specific", assay: "Complete assays / kits", scaffolding: "Scaffolding",
};
const CATEGORY_ORDER = ["lineage", "celltype", "functional", "tissue", "assay", "disease", "scaffolding"];

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
  const budget = useBudget();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);

  const modules = useMemo(() => idx.modulesFor(setup), [idx, setup]);
  const have = useMemo(() => new Set(rows.map((r) => r.targetId)), [rows]);
  const hits = useMemo(() => idx.search(q, setup), [idx, q, setup]);
  const moduleHits = useMemo(() => (q.includes(",") ? [] : idx.searchModules(q, setup)), [idx, q, setup]);
  // Nothing for this modality? Show what exists for the other one, disabled, so "NK cells" never dead-ends on a custom-conjugation offer.
  const otherHits = useMemo(() => (q.includes(",") || moduleHits.length ? [] : idx.searchModules(q, setup, 3, true)), [idx, q, setup, moduleHits]);
  // A cell type typed by name ("NK cells") beats a marker; a marker typed by name ("CD4") beats the "CD4 helper T cells" module.
  const modulesFirst = !hits.length || moduleHits.some((m) => [m.name, ...m.aliases].some((a) => normKey(a) === normKey(q)));
  const suggestions = useMemo(() => idx.suggestNext(rows, setup), [idx, rows, setup]);
  const cats = CATEGORY_ORDER.filter((c) => modules.some((m) => m.category === c));
  const visible = modules.filter((m) => m.category !== "scaffolding" && (!cat || m.category === cat));

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
  const pickFirst = () => {
    if (q.includes(",")) pasteList();
    else if (moduleHits[0] && modulesFirst) { addModule(moduleHits[0]); setQ(""); }
    else if (hits[0]) { addTarget(hits[0].id); setQ(""); }
  };

  const moduleHit = (m: PanelModule) => {
    const added = isAdded(m);
    const cov = coverage(m);
    return (
      <button key={m.id} disabled={added} onClick={() => { addModule(m); setQ(""); }} data-testid="module-hit"
        className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-teal-50 disabled:opacity-50 dark:border-slate-800 dark:hover:bg-slate-800">
        <span className="min-w-0">
          <span className="font-medium">{m.name}</span>
          <Pill tone="teal" className="ml-2">{m.category === "celltype" ? "cell type" : "module"}</Pill>
          <span className="mt-0.5 block truncate text-xs text-slate-500">{m.definition ?? m.markers.filter((k) => markerPlan(k, setup) !== "skip").map(markerLabel).join(", ")}</span>
        </span>
        <span className="hidden max-w-[45%] shrink-0 truncate text-xs text-slate-500 sm:block">{added ? "added" : cov.missing.length === 0 ? "all in panel" : `adds ${cov.missing.map(markerLabel).join(", ")}`}</span>
      </button>
    );
  };
  const targetHit = (t: Target) => {
    const opts = idx.cloneOptions(t.id, setup);
    const added = have.has(t.id);
    const np = paperCount(t.id);
    return (
      <button key={t.id} disabled={added} onClick={() => { addTarget(t.id); setQ(""); }}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800">
        <span><span className="font-medium">{t.name}</span>{t.aliases.length > 0 && <span className="ml-2 text-xs text-slate-500">{t.aliases.slice(0, 3).join(" · ")}</span>}</span>
        <span className="text-xs text-slate-500">
          {np > 0 && <span className="mr-2 rounded bg-slate-100 px-1 text-[10px] dark:bg-slate-800" title="CyTOF / IMC papers mentioning this marker">{np} paper{np > 1 ? "s" : ""}</span>}
          {added ? "added" : opts.length ? `${opts.length} clone${opts.length > 1 ? "s" : ""} · ${new Set(opts.flatMap((o) => o.metals)).size} metals` : "custom conjugation"}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <section>
        <H2 hint="type a marker, an alias (PD-L1 finds CD274), a cell type (dendritic cells) or paste a comma-separated list">Add a marker or cell type</H2>
        <div className="relative">
          <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={ensurePubs} placeholder="e.g. CD8a, FoxP3, granzyme, NK cells…" autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done"
            onKeyDown={(e) => { if (e.key === "Enter") pickFirst(); }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900" />
          {q && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {q.includes(",") && <button onClick={pasteList} className="block w-full px-3 py-2 text-left text-sm font-medium text-teal-700 hover:bg-slate-50 dark:hover:bg-slate-800">Add all {q.split(/[,;\n]+/).filter((s) => s.trim()).length} markers from this list</button>}
              {modulesFirst && moduleHits.map(moduleHit)}
              {hits.map(targetHit)}
              {!modulesFirst && moduleHits.map(moduleHit)}
              {otherHits.map((m) => (
                <div key={m.id} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-400 dark:border-slate-800" data-testid="module-hit-other">
                  <span className="min-w-0"><span className="font-medium">{m.name}</span><Pill tone="slate" className="ml-2">{m.application === "imaging" ? "tissue imaging only" : "suspension only"}</Pill>
                    <span className="mt-0.5 block truncate text-xs">{m.definition}</span></span>
                  <span className="shrink-0 text-xs">its markers are not sold for {setup.modality === "imaging" ? "IMC" : "CyTOF"}; switch modality in Setup or add them as custom conjugations</span>
                </div>
              ))}
              {!hits.length && !moduleHits.length && !q.includes(",") && (
                <button onClick={() => { addCustom(q.trim()); setQ(""); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                  No catalogue antibody for “{q}” — add as a <span className="font-medium">custom conjugation</span> (you supply the antibody; Maxpar X8 labelling)
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {suggestions.length > 0 && (
        <section>
          <H2 hint="from modules that overlap your panel">Suggested next</H2>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => <Pill key={s.targetId} tone="teal" onClick={() => addTarget(s.targetId)} title={s.reason}>+ {s.name}<span className="ml-1 font-normal opacity-70">{s.reason}</span></Pill>)}
          </div>
        </section>
      )}

      <section>
        <H2 hint={`${modules.length} modules for ${setup.modality} · ${setup.species}`}>Start from a module or a cell type</H2>
        <div className="mb-3 flex flex-wrap gap-1">
          <Button size="sm" variant={cat ? "ghost" : "secondary"} onClick={() => setCat(null)}>All</Button>
          {cats.filter((c) => c !== "scaffolding").map((c) => <Button key={c} size="sm" variant={cat === c ? "secondary" : "ghost"} onClick={() => setCat(c)}>{CATEGORY_LABEL[c] ?? c}</Button>)}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visible.map((m) => {
            const added = isAdded(m);
            const cov = coverage(m);
            const markers = m.markers.filter((k) => k.kind === "antibody");
            const hasNeg = markers.some((k) => k.polarity === "neg");
            const nMissing = cov.missing.length;
            return (
              <Card key={m.id} active={added} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium leading-tight">{m.name}</div>
                    {m.definition && <div className="mt-0.5 font-mono text-[11px] text-teal-800 dark:text-teal-200">{m.definition}</div>}
                    <div className="mt-0.5 text-xs text-slate-500">{m.blurb}</div>
                  </div>
                  {m.source === "sbt_kit" && <Pill tone="violet" title="Sold as a kit by Standard BioTools">SBT kit</Pill>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {markers.slice(0, 14).map((k) => {
                    const neg = k.polarity === "neg";
                    const plan = markerPlan(k, setup);
                    const unsold = k.in_catalogue && !k.applications.includes(setup.modality);
                    const title = !k.in_catalogue ? "not in catalogue: custom conjugation"
                      : unsold ? `not sold for ${setup.modality === "imaging" ? "IMC" : "CyTOF"}: ${plan === "custom" ? "added as a custom conjugation" : "left out"}`
                      : neg ? `${k.role} · lineage negative: separates this cell type from its neighbours` : k.role;
                    return (
                      <span key={rowIdOf(k)} title={title}
                        className={cx("rounded px-1.5 py-0.5 text-[11px]", inPanel(k) ? "bg-teal-100 text-teal-900 dark:bg-teal-900 dark:text-teal-100" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", neg && "border border-dashed border-slate-400", (k.role === "optional" || plan === "skip") && "opacity-60", (!k.in_catalogue || (unsold && plan === "skip")) && "line-through")}>
                        {markerLabel(k)}
                      </span>
                    );
                  })}
                  {markers.length > 14 && <span className="text-[11px] text-slate-500">+{markers.length - 14} more</span>}
                </div>
                {(hasNeg || markers.some((k) => k.in_catalogue && !k.applications.includes(setup.modality))) && (
                  <div className="text-[11px] text-slate-500">
                    {hasNeg && "Dashed = lineage negative, added so the gate stays clean. "}
                    {markers.some((k) => k.in_catalogue && !k.applications.includes(setup.modality)) && `Struck through = not sold for ${setup.modality === "imaging" ? "IMC" : "CyTOF"}${markers.some((k) => markerPlan(k, setup) === "custom" && k.in_catalogue) ? " (required ones go in as custom conjugations)" : ""}.`}
                  </div>
                )}
                <div className="mt-auto flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">
                    {added ? `${cov.n}/${cov.total} in panel` : cov.n === 0 ? `${cov.total} marker${cov.total === 1 ? "" : "s"}` : nMissing === 0 ? "all targets already in panel" : `${cov.n} of ${cov.total} already in panel`}
                  </span>
                  {added
                    ? <Button size="sm" variant="danger" onClick={() => removeModule(m.id)}>Remove</Button>
                    : nMissing === 0
                      ? <Button size="sm" variant="secondary" title="Every marker is already in your panel; tag them as this module" onClick={() => addModule(m)}>Tag as module</Button>
                      : <Button size="sm" variant="primary" onClick={() => addModule(m)}>Add {nMissing} marker{nMissing === 1 ? "" : "s"}</Button>}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button variant="primary" size="lg" disabled={!rows.length} onClick={() => setStep("balance")}>{balanced ? "Back to balance →" : "Balance panel →"}</Button>
        <span className="text-sm text-slate-500">{rows.length} of ~{budget} channels used</span>
      </div>
    </div>
  );
}
