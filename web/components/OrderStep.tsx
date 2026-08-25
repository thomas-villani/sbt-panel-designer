"use client";
import { useMemo, useState } from "react";
import { IMAGING_SIZING_NOTE, accessories, bomCsv, buildBom } from "@/lib/bom";
import { reservedRoles } from "@/lib/data";
import { useStore } from "@/lib/store";
import { shareUrl } from "@/lib/url";
import { Button, H2, Pill } from "./ui";

export function OrderStep() {
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const rows = useStore((s) => s.rows);
  const result = useStore((s) => s.result);
  const nSamples = useStore((s) => s.nSamples);
  const setNSamples = useStore((s) => s.setNSamples);
  const balanced = useStore((s) => s.balanced);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");

  const bom = useMemo(() => buildBom(idx, rows, result, setup, nSamples), [idx, rows, result, setup, nSamples]);
  const acc = useMemo(() => accessories(idx, setup, reservedRoles(setup)), [idx, setup]);
  const kits = useMemo(() => {
    const ids = new Set(rows.flatMap((r) => r.moduleIds));
    return [...ids].map((id) => idx.modulesById.get(id)).filter((m) => m && m.source === "sbt_kit");
  }, [idx, rows]);
  const custom = bom.filter((l) => !l.sku);

  const download = () => {
    const blob = new Blob([bomCsv(bom, setup)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pd3-panel-${setup.instrumentId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const share = async () => {
    const url = shareUrl({ setup, rows, nSamples, balanced });
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt("Copy this link", url); }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end gap-4">
        <H2>Order</H2>
        <label className="text-sm">
          <span className="mr-2 text-slate-600 dark:text-slate-300">{setup.modality === "imaging" ? "Slides" : "Samples"} to stain</span>
          <input type="number" min={1} value={nSamples} onChange={(e) => setNSamples(Number(e.target.value))} className="w-20 rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900" />
        </label>
        <span className="text-xs text-slate-500">{setup.modality === "imaging" ? IMAGING_SIZING_NOTE : "vials sized to cover the sample count with the fewest large-format vials"}</span>
      </section>

      {kits.length > 0 && (
        <div className="rounded-md border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100">
          This panel includes markers from {kits.map((k) => k!.name).join(", ")}. Those are sold as kits; kit-level SKUs and pricing come with the store integration, so they are listed here as individual conjugates.
        </div>
      )}

      <section className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr><th className="py-1 pr-3">Marker</th><th className="py-1 pr-3">Clone</th><th className="py-1 pr-3">Metal</th><th className="py-1 pr-3">Part number</th><th className="py-1 pr-3">Format</th><th className="py-1 pr-3 text-right">Qty</th><th className="py-1">Notes</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {bom.map((l) => (
              <tr key={l.row.id}>
                <td className="py-1.5 pr-3 font-medium">{l.row.name}</td>
                <td className="py-1.5 pr-3">{l.row.clone ?? <Pill tone="violet">custom</Pill>}</td>
                <td className="py-1.5 pr-3">{l.metal ?? "—"}</td>
                <td className="py-1.5 pr-3 font-mono text-xs">{l.sku?.part_number ?? "—"}{l.tds && <a href={l.tds} target="_blank" rel="noreferrer" className="ml-2 font-sans text-teal-700 underline">TDS</a>}</td>
                <td className="py-1.5 pr-3 text-xs text-slate-500">{l.sku?.format?.raw ?? ""}</td>
                <td className="py-1.5 pr-3 text-right">{l.sku ? l.qty : ""}</td>
                <td className="py-1.5 text-xs text-slate-500">{l.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <H2 hint="reserved channels you set up">Also needed</H2>
        <ul className="space-y-1 text-sm">
          {acc.map((a) => <li key={a.label}><b>{a.label}</b> <span className="text-xs text-slate-500">{a.note}</span></li>)}
          {custom.length > 0 && <li><b>Custom conjugation</b> <span className="text-xs text-slate-500">{custom.length} marker{custom.length > 1 ? "s" : ""}: Maxpar X8 labelling kit or SBT's conjugation service (lead time applies)</span></li>}
        </ul>
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={download}>Download CSV</Button>
        <Button onClick={share}>{copied ? "Link copied" : "Copy share link"}</Button>
        <span className="flex-1" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@lab.edu" className="rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900" />
        <Button disabled title="Store cart / quote integration comes after UI sign-off">Request a quote</Button>
      </section>
      <p className="text-xs text-slate-500">Prices, cart and quote submission are not wired in this demo. Every state of this designer is in the URL: share it with your core facility or an application scientist.</p>
    </div>
  );
}
