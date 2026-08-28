"use client";
/** Every marker sold for the current setup, in one table: what is labelled, on which metals, and which panels use it. */
import { useMemo, useState } from "react";
import { normKey } from "@/lib/data";
import { useStore } from "@/lib/store";
import type { Target } from "@/lib/types";
import { InModules } from "./InModules";
import { Button, H2, cx } from "./ui";

type Sort = "name" | "papers" | "clones" | "modules";
const PAGE = 120;

export function BrowseAll({ onClose }: { onClose: () => void }) {
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const rows = useStore((s) => s.rows);
  const addTarget = useStore((s) => s.addTarget);
  const removeRow = useStore((s) => s.removeRow);
  const pubs = useStore((s) => s.pubs);
  const ensurePubs = useStore((s) => s.ensurePubs);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [inModuleOnly, setInModuleOnly] = useState(false);
  const [hideAdded, setHideAdded] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const modality = setup.modality === "imaging" ? "IMC" : "CyTOF";
  const have = useMemo(() => new Set(rows.map((r) => r.targetId)), [rows]);

  const all = useMemo(() => idx.allTargets(setup).map((t) => {
    const opts = idx.cloneOptions(t.id, setup);
    return {
      t,
      clones: opts.length,
      metals: [...new Set(opts.flatMap((o) => o.metals))].sort((a, b) => Number.parseInt(a) - Number.parseInt(b)),
      validated: opts.some((o) => o.sampleValidated),
      modules: idx.modulesWith(t.id, setup).filter((m) => m.category !== "scaffolding"),
      tds: opts.find((o) => o.tds)?.tds ?? null,
    };
  }), [idx, setup]);

  const list = useMemo(() => {
    const nq = normKey(q);
    const papers = (t: Target) => pubs?.targets[t.id]?.n ?? 0;
    const out = all.filter((r) =>
      (!nq || normKey(r.t.name).includes(nq) || r.t.aliases.some((a) => normKey(a).includes(nq)) || r.modules.some((m) => normKey(m.name).includes(nq))) &&
      (!inModuleOnly || r.modules.length > 0) &&
      (!hideAdded || !have.has(r.t.id)));
    const by: Record<Sort, (a: typeof out[number], b: typeof out[number]) => number> = {
      name: (a, b) => a.t.name.localeCompare(b.t.name),
      papers: (a, b) => papers(b.t) - papers(a.t) || a.t.name.localeCompare(b.t.name),
      clones: (a, b) => b.clones - a.clones || a.t.name.localeCompare(b.t.name),
      modules: (a, b) => b.modules.length - a.modules.length || a.t.name.localeCompare(b.t.name),
    };
    return [...out].sort(by[sort]);
  }, [all, q, sort, inModuleOnly, hideAdded, have, pubs]);

  const shown = list.slice(0, limit);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900" data-testid="browse-all">
      <H2 hint={`${list.length} of ${all.length} markers sold for ${modality} · ${setup.species === "other" ? "any species" : setup.species}`}>
        <span className="flex items-center gap-2">All markers <Button size="sm" variant="ghost" onClick={onClose}>close</Button></span>
      </H2>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} onFocus={ensurePubs} placeholder="filter by name, alias or panel…" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900" />
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={inModuleOnly} onChange={() => { setInModuleOnly((v) => !v); setLimit(PAGE); }} className="h-3.5 w-3.5 accent-teal-700" />in a marker set
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={hideAdded} onChange={() => { setHideAdded((v) => !v); setLimit(PAGE); }} className="h-3.5 w-3.5 accent-teal-700" />not yet added
        </label>
        <label className="text-xs text-slate-600 dark:text-slate-300">
          sort{" "}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-900">
            <option value="name">A–Z</option>
            <option value="papers">papers</option>
            <option value="clones">clones</option>
            <option value="modules">marker sets</option>
          </select>
        </label>
      </div>

      <div className="max-h-[65vh] overflow-auto rounded-lg border border-slate-100 dark:border-slate-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-600 dark:text-slate-400 dark:bg-slate-800">
            <tr>
              <th className="px-2 py-1.5">Marker</th>
              <th className="px-2 py-1.5">Clones</th>
              <th className="px-2 py-1.5">Metals</th>
              <th className="px-2 py-1.5">Papers</th>
              <th className="px-2 py-1.5">In panels</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {shown.map((r) => {
              const added = have.has(r.t.id);
              const np = pubs?.targets[r.t.id]?.n ?? 0;
              return (
                <tr key={r.t.id} className={cx(added && "bg-teal-50/60 dark:bg-teal-950/40")}>
                  <td className="px-2 py-1.5 align-top">
                    <div className="font-medium">{r.t.name}</div>
                    {setup.modality === "imaging" && !r.validated && r.clones > 0 && <div className="text-[11px] text-amber-700 dark:text-amber-300" title="no clone lists this sample type on its datasheet">not {setup.sampleType}-validated</div>}
                    {r.t.aliases.length > 0 && <div className="text-[11px] text-slate-600 dark:text-slate-400">{r.t.aliases.slice(0, 4).join(" · ")}</div>}
                  </td>
                  <td className="px-2 py-1.5 align-top tabular-nums">{r.clones || <span className="text-violet-700 dark:text-violet-300">custom</span>}</td>
                  <td className="px-2 py-1.5 align-top text-[11px] text-slate-600 dark:text-slate-400">{r.metals.length ? `${r.metals.length}: ${r.metals.slice(0, 4).join(", ")}${r.metals.length > 4 ? "…" : ""}` : "—"}
                    {r.tds && <a href={r.tds} target="_blank" rel="noreferrer" className="ml-1 text-teal-700 underline dark:text-teal-300">TDS</a>}</td>
                  <td className="px-2 py-1.5 align-top tabular-nums text-slate-600 dark:text-slate-400">{np || ""}</td>
                  <td className="px-2 py-1.5 align-top">{r.modules.length ? <InModules modules={r.modules} max={2} bare /> : <span className="text-[11px] text-slate-400">—</span>}</td>
                  <td className="px-2 py-1.5 align-top text-right">
                    {added
                      ? <Button size="sm" variant="ghost" onClick={() => { const row = rows.find((x) => x.targetId === r.t.id); if (row) removeRow(row.id); }} title="remove from panel">remove</Button>
                      : <Button size="sm" variant="secondary" onClick={() => addTarget(r.t.id)}>add</Button>}
                  </td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={6} className="px-2 py-6 text-center text-sm text-slate-600 dark:text-slate-400">Nothing matches “{q}”.</td></tr>}
          </tbody>
        </table>
      </div>
      {list.length > shown.length && (
        <div className="mt-2 text-center">
          <Button size="sm" onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, list.length - shown.length)} more ({list.length - shown.length} left)</Button>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">
        Every marker here has an off-the-shelf {modality} conjugate. Anything else can still go in the panel as a custom
        conjugation — type its name in the search box above.
      </p>
    </section>
  );
}
