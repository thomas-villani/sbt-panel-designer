"use client";
/**
 * The order, read from one structured object (lib/bom.ts `buildOrder`): this page, the CSV and the future cart / quote
 * sink all see the same lines, kits and accepted-spill notes.
 */
import { useMemo, useState } from "react";
import { IMAGING_SIZING_NOTE, bomCsv, buildOrder } from "@/lib/bom";
import { useStore } from "@/lib/store";
import { shareUrl } from "@/lib/url";
import { Button, H2, Pill } from "./ui";

/** Trigger a file download for text content. The anchor must be in the document and the URL must outlive the click. */
export function downloadText(filename: string, text: string, type = "text/csv"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
}

export function OrderStep() {
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const rows = useStore((s) => s.rows);
  const result = useStore((s) => s.result);
  const nSamples = useStore((s) => s.nSamples);
  const setNSamples = useStore((s) => s.setNSamples);
  const balanced = useStore((s) => s.balanced);
  const [copied, setCopied] = useState(false);

  const order = useMemo(() => buildOrder(idx, rows, result, setup, nSamples), [idx, rows, result, setup, nSamples]);
  const { lines, kits, custom, accessories, accepted } = order;

  const download = () => downloadText(`pd3-panel-${setup.instrumentId}.csv`, bomCsv(lines, setup));
  const share = async () => {
    const url = shareUrl({ setup, rows, nSamples, balanced }, idx);
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
        <span className="text-xs text-slate-600 dark:text-slate-400">{setup.modality === "imaging" ? IMAGING_SIZING_NOTE : "vials sized to cover the sample count with the fewest large-format vials"}</span>
      </section>

      {kits.length > 0 && (
        <div className="rounded-md border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100" data-testid="kit-lines">
          <div className="font-medium">Kits in this order</div>
          <ul className="mt-1 space-y-0.5">
            {kits.map((k) => <li key={k.moduleId}><b>{k.name}</b> <span className="text-xs">· {k.rowIds.length} marker{k.rowIds.length === 1 ? "" : "s"} on the kit's own metals · one SKU{k.partNumber ? ` · ${k.partNumber}` : " (catalogue no. comes with the store feed)"}</span></li>)}
          </ul>
        </div>
      )}

      <section className="overflow-x-auto" data-testid="bom">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs uppercase text-slate-600 dark:text-slate-400">
            <tr><th className="py-1 pr-3">Marker</th><th className="py-1 pr-3">Clone</th><th className="py-1 pr-3">Metal</th><th className="py-1 pr-3">Part number</th><th className="py-1 pr-3">Format</th><th className="py-1 pr-3 text-right">Qty</th><th className="py-1">Notes</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {lines.map((l) => (
              <tr key={l.row.id}>
                <td className="py-1.5 pr-3 font-medium">{l.row.name}</td>
                <td className="py-1.5 pr-3">{l.row.clone ?? <Pill tone="violet">custom</Pill>}</td>
                <td className="py-1.5 pr-3">{l.metal ?? "—"}</td>
                <td className="py-1.5 pr-3 font-mono text-xs">{l.sku?.part_number ?? (l.kit ? <span className="font-sans text-slate-600 dark:text-slate-400" title={`supplied in the ${l.kit} kit, one SKU above`}>in kit</span> : "—")}{l.tds && <a href={l.tds} target="_blank" rel="noreferrer" className="ml-2 font-sans text-teal-700 underline">TDS</a>}</td>
                <td className="py-1.5 pr-3 text-xs text-slate-600 dark:text-slate-400">{l.sku?.format?.raw ?? ""}</td>
                <td className="py-1.5 pr-3 text-right">{l.sku ? l.qty : ""}</td>
                <td className="py-1.5 text-xs text-slate-600 dark:text-slate-400">{l.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <H2 hint="reserved channels you set up">Also needed</H2>
        <ul className="space-y-1 text-sm">
          {accessories.map((a) => <li key={a.label}><b>{a.label}</b> <span className="text-xs text-slate-600 dark:text-slate-400">{a.note}</span></li>)}
          {custom.length > 0 && <li><b>Custom conjugation</b> <span className="text-xs text-slate-600 dark:text-slate-400">{custom.length} marker{custom.length > 1 ? "s" : ""}: Maxpar X8 labelling kit or SBT's conjugation service (lead time applies)</span></li>}
        </ul>
      </section>

      {accepted.length > 0 && (
        <section data-testid="accepted-spill">
          <H2 hint="signed off on the Balance page; travels with the share link">Spillover you accepted</H2>
          <ul className="space-y-1 text-sm">
            {accepted.map((a) => (
              <li key={a.rowId}><b>{a.name}</b>{a.channel ? ` (${a.channel})` : ""}{a.from ? ` receives ${a.receivedPct} % of its tolerance, mostly from ${a.from}` : ""} <span className="text-xs text-slate-600 dark:text-slate-400">— {a.reason}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={download}>Download CSV</Button>
        <Button onClick={share}>{copied ? "Link copied" : "Copy share link"}</Button>
        <span className="flex-1" />
        <Button disabled title="Store cart / quote integration comes after UI sign-off">Request a quote</Button>
      </section>
      <p className="text-xs text-slate-600 dark:text-slate-400">Prices, cart and quote submission are not wired in this demo. Every state of this designer is in the URL: share it with your core facility or an application scientist.</p>
    </div>
  );
}
