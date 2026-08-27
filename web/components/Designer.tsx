"use client";
import { useEffect, useState } from "react";
import { loadBundles } from "@/lib/data";
import { useStore, useBudget, useHealth, type Step } from "@/lib/store";
import { BalanceStep } from "./BalanceStep";
import { BuildStep } from "./BuildStep";
import { OrderStep } from "./OrderStep";
import { PanelSidebar } from "./PanelSidebar";
import { SetupStep } from "./SetupStep";
import { cx } from "./ui";

const STEPS: { id: Step; label: string; n: number }[] = [
  { id: "setup", label: "Setup", n: 1 }, { id: "build", label: "Build", n: 2 }, { id: "balance", label: "Balance", n: 3 }, { id: "order", label: "Order", n: 4 },
];

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function Designer() {
  const idx = useStore((s) => s.idx);
  const init = useStore((s) => s.init);
  const step = useStore((s) => s.step);
  const setStep = useStore((s) => s.setStep);
  const rows = useStore((s) => s.rows);
  const balanced = useStore((s) => s.balanced);
  const restoredDraft = useStore((s) => s.restoredDraft);
  const dismissRestored = useStore((s) => s.dismissRestored);
  const clearPanel = useStore((s) => s.clearPanel);
  const [error, setError] = [useStore((s) => s.loadError), (e: string) => useStore.setState({ loadError: e })];
  const [sheet, setSheet] = useState(false); // mobile: the panel slides up over the page

  useEffect(() => {
    if (idx) return;
    loadBundles().then(init).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { setSheet(false); }, [step]); // changing step closes the sheet

  if (error) return <div className="p-8 text-rose-700">Could not load the panel data: {error}</div>;
  if (!idx) return <div className="p-8 text-slate-500">Loading catalogue…</div>;

  const enabled = (s: Step) => s === "setup" || s === "build" || rows.length > 0 && (s === "balance" || balanced);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-teal-800 bg-teal-700 text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 sm:gap-6 sm:px-4">
          <a href="https://www.standardbio.com" target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-3" title="Standard BioTools">
            <img src={`${BASE}/brand/sbt-logo-white.svg`} alt="Standard BioTools" className="h-7 w-auto sm:h-8" />
            <span className="hidden text-sm font-semibold leading-tight tracking-wide md:block">Standard<br />BioTools</span>
          </a>
          <div className="flex min-w-0 items-baseline gap-2 border-l border-white/25 pl-3 sm:pl-6">
            <span className="truncate text-sm font-bold tracking-tight sm:text-base"><span className="hidden sm:inline">Maxpar </span>Panel Designer</span>
            <span className="hidden rounded bg-sbt-red/90 px-1.5 text-[10px] font-semibold uppercase text-white md:inline">demo · public data</span>
          </div>
          <nav className="ml-auto flex shrink-0 items-center gap-0.5 text-sm sm:gap-1" aria-label="Steps">
            {STEPS.map((s) => (
              <button key={s.id} disabled={!enabled(s.id)} onClick={() => setStep(s.id)} aria-label={s.label} aria-current={step === s.id ? "step" : undefined}
                className={cx("flex items-center gap-1.5 rounded-md px-1.5 py-1.5 disabled:opacity-40 sm:px-3", step === s.id ? "bg-white text-teal-700 shadow-sm" : "text-white/85 hover:bg-white/10")}>
                <span className={cx("grid h-6 w-6 place-items-center rounded-full text-xs sm:h-5 sm:w-5", step === s.id ? "bg-teal-100 text-teal-800" : "bg-white/15")}>{s.n}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>
      {restoredDraft && (
        <div className="border-b border-teal-200 bg-teal-50 text-sm text-teal-900 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-100" data-testid="restored-draft">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
            <span>Picked up the panel you were working on last time ({rows.length} markers).</span>
            <button className="underline" onClick={dismissRestored}>Keep it</button>
            <button className="underline" onClick={() => { clearPanel(); setStep("setup"); }}>Start fresh</button>
          </div>
        </div>
      )}
      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-6 px-3 py-4 pb-24 sm:px-4 sm:py-6 lg:grid-cols-[1fr_360px] lg:pb-6">
        <main className="min-w-0">
          {step === "setup" && <SetupStep />}
          {step === "build" && <BuildStep />}
          {step === "balance" && <BalanceStep />}
          {step === "order" && <OrderStep />}
        </main>
        <aside className="hidden lg:sticky lg:top-14 lg:block lg:self-start"><PanelSidebar /></aside>
      </div>

      {/* Mobile: the panel lives in a bottom bar that expands into a sheet. */}
      <MobilePanelBar open={sheet} onToggle={() => setSheet((v) => !v)} />
    </div>
  );
}

function MobilePanelBar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const rows = useStore((s) => s.rows);
  const result = useStore((s) => s.result);
  const balanced = useStore((s) => s.balanced);
  const balancing = useStore((s) => s.balancing);
  const step = useStore((s) => s.step);
  const setStep = useStore((s) => s.setStep);
  const budget = useBudget();
  const health = useHealth();
  const next: { label: string; to: Step } | null =
    step === "setup" ? { label: "Choose markers", to: "build" }
      : step === "build" && rows.length ? { label: balanced ? "Balance" : "Balance panel", to: "balance" }
        : step === "balance" && result && !result.unassigned.length ? { label: "Order", to: "order" } : null;

  return (
    <div className="lg:hidden">
      {open && <div className="fixed inset-0 z-30 bg-slate-900/40" onClick={onToggle} aria-hidden />}
      <div className={cx("fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-slate-200 bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.12)] dark:border-slate-700 dark:bg-slate-900", open && "max-h-[80vh] rounded-t-2xl")} data-testid="mobile-panel">
        <button onClick={onToggle} aria-expanded={open} aria-controls="mobile-panel-sheet"
          className="flex w-full items-center gap-3 px-4 py-3 text-left" data-testid="mobile-panel-toggle">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Your panel · {rows.length} of ~{budget}</span>
            <span className="block truncate text-xs text-slate-500">
              {rows.length === 0 ? "nothing added yet"
                : balancing && !result ? "checking…"
                  : health && (balanced || health.tone !== "emerald") ? health.headline
                    : `${rows.slice(0, 4).map((r) => r.name).join(", ")}${rows.length > 4 ? ` +${rows.length - 4}` : ""}`}
            </span>
          </span>
          {next && !open && (
            <span role="button" onClick={(e) => { e.stopPropagation(); setStep(next.to); }}
              className="shrink-0 rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white shadow-sm">{next.label} →</span>
          )}
          <span className={cx("shrink-0 text-slate-400 transition", open && "rotate-180")} aria-hidden>▲</span>
        </button>
        {open && <div id="mobile-panel-sheet" className="min-h-0 flex-1 overflow-y-auto px-2 pb-[env(safe-area-inset-bottom)]"><PanelSidebar /></div>}
      </div>
    </div>
  );
}
