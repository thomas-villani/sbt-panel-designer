"use client";
import { useMemo, useState } from "react";
import { useStore, useBudget } from "@/lib/store";
import type { PanelModule } from "@/lib/types";
import { Button, Card, H2, Pill, cx } from "./ui";

const CATEGORY_LABEL: Record<string, string> = {
  lineage: "Lineage", functional: "Functional state", tissue: "Tissue", disease: "Disease-specific", assay: "Complete assays / kits", scaffolding: "Scaffolding",
};
const CATEGORY_ORDER = ["lineage", "functional", "tissue", "assay", "disease", "scaffolding"];

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
  const budget = useBudget();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);

  const modules = useMemo(() => idx.modulesFor(setup), [idx, setup]);
  const have = useMemo(() => new Set(rows.map((r) => r.targetId)), [rows]);
  const hits = useMemo(() => idx.search(q, setup), [idx, q, setup]);
  const suggestions = useMemo(() => idx.suggestNext(rows, setup), [idx, rows, setup]);
  const cats = CATEGORY_ORDER.filter((c) => modules.some((m) => m.category === c));
  const visible = modules.filter((m) => m.category !== "scaffolding" && (!cat || m.category === cat));

  const isAdded = (m: PanelModule) => rows.some((r) => r.moduleIds.includes(m.id));
  const coverage = (m: PanelModule) => {
    const ids = m.markers.filter((k) => k.kind === "antibody" && k.role !== "optional").map((k) => k.target_id ?? `custom:${k.target_name}`);
    const n = ids.filter((id) => have.has(id) || rows.some((r) => r.id === id)).length;
    return { n, total: ids.length };
  };

  const pasteList = () => {
    const names = q.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (names.length < 2) return;
    for (const n of names) {
      const t = idx.search(n, setup, 1)[0];
      if (t) addTarget(t.id); else addCustom(n);
    }
    setQ("");
  };

  return (
    <div className="space-y-6">
      <section>
        <H2 hint="type a marker, an alias (PD-L1 finds CD274), or paste a comma-separated list">Add a marker</H2>
        <div className="relative">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. CD8a, FoxP3, granzyme…" autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") { if (q.includes(",")) pasteList(); else if (hits[0]) { addTarget(hits[0].id); setQ(""); } } }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900" />
          {q && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {q.includes(",") && <button onClick={pasteList} className="block w-full px-3 py-2 text-left text-sm font-medium text-teal-700 hover:bg-slate-50 dark:hover:bg-slate-800">Add all {q.split(/[,;\n]+/).filter((s) => s.trim()).length} markers from this list</button>}
              {hits.map((t) => {
                const opts = idx.cloneOptions(t.id, setup);
                const added = have.has(t.id);
                return (
                  <button key={t.id} disabled={added} onClick={() => { addTarget(t.id); setQ(""); }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800">
                    <span><span className="font-medium">{t.name}</span>{t.aliases.length > 0 && <span className="ml-2 text-xs text-slate-500">{t.aliases.slice(0, 3).join(" · ")}</span>}</span>
                    <span className="text-xs text-slate-500">{added ? "added" : opts.length ? `${opts.length} clone${opts.length > 1 ? "s" : ""} · ${new Set(opts.flatMap((o) => o.metals)).size} metals` : "custom conjugation"}</span>
                  </button>
                );
              })}
              {!hits.length && !q.includes(",") && (
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
        <H2 hint={`${modules.length} modules for ${setup.modality} · ${setup.species}`}>Start from a module</H2>
        <div className="mb-3 flex flex-wrap gap-1">
          <Button size="sm" variant={cat ? "ghost" : "secondary"} onClick={() => setCat(null)}>All</Button>
          {cats.filter((c) => c !== "scaffolding").map((c) => <Button key={c} size="sm" variant={cat === c ? "secondary" : "ghost"} onClick={() => setCat(c)}>{CATEGORY_LABEL[c] ?? c}</Button>)}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visible.map((m) => {
            const added = isAdded(m);
            const cov = coverage(m);
            const markers = m.markers.filter((k) => k.kind === "antibody");
            return (
              <Card key={m.id} active={added} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium leading-tight">{m.name}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{m.blurb}</div>
                  </div>
                  {m.source === "sbt_kit" && <Pill tone="violet" title="Sold as a kit by Standard BioTools">SBT kit</Pill>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {markers.slice(0, 14).map((k) => {
                    const id = k.target_id ?? `custom:${k.target_name}`;
                    const inPanel = rows.some((r) => r.id === id);
                    return <span key={id} className={cx("rounded px-1.5 py-0.5 text-[11px]", inPanel ? "bg-teal-100 text-teal-900 dark:bg-teal-900 dark:text-teal-100" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", !k.in_catalogue && "line-through opacity-60")} title={!k.in_catalogue ? "not in catalogue: custom conjugation" : k.role}>{k.target_name}</span>;
                  })}
                  {markers.length > 14 && <span className="text-[11px] text-slate-500">+{markers.length - 14} more</span>}
                </div>
                <div className="mt-auto flex items-center justify-between">
                  <span className="text-xs text-slate-500">{cov.n}/{cov.total} in panel</span>
                  {added
                    ? <Button size="sm" variant="danger" onClick={() => removeModule(m.id)}>Remove</Button>
                    : <Button size="sm" variant="primary" onClick={() => addModule(m)}>Add {cov.total - cov.n} markers</Button>}
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
