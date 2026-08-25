"use client";
import { useEffect } from "react";
import { loadBundles } from "@/lib/data";
import { useStore, type Step } from "@/lib/store";
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
  const [error, setError] = [useStore((s) => s.loadError), (e: string) => useStore.setState({ loadError: e })];

  useEffect(() => {
    if (idx) return;
    loadBundles().then(init).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <div className="p-8 text-rose-700">Could not load the panel data: {error}</div>;
  if (!idx) return <div className="p-8 text-slate-500">Loading catalogue…</div>;

  const enabled = (s: Step) => s === "setup" || s === "build" || rows.length > 0 && (s === "balance" || balanced);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-teal-800 bg-teal-700 text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-2">
          <a href="https://www.standardbio.com" target="_blank" rel="noreferrer" className="flex items-center gap-3" title="Standard BioTools">
            <img src={`${BASE}/brand/sbt-logo-white.svg`} alt="Standard BioTools" className="h-8 w-auto" />
            <span className="hidden text-sm font-semibold leading-tight tracking-wide sm:block">Standard<br />BioTools</span>
          </a>
          <div className="flex items-baseline gap-2 border-l border-white/25 pl-6">
            <span className="text-base font-bold tracking-tight">Maxpar Panel Designer</span>
            <span className="rounded bg-sbt-red/90 px-1.5 text-[10px] font-semibold uppercase text-white">demo · public data</span>
          </div>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            {STEPS.map((s) => (
              <button key={s.id} disabled={!enabled(s.id)} onClick={() => setStep(s.id)}
                className={cx("flex items-center gap-1.5 rounded-md px-3 py-1.5 disabled:opacity-40", step === s.id ? "bg-white text-teal-700 shadow-sm" : "text-white/85 hover:bg-white/10")}>
                <span className={cx("grid h-5 w-5 place-items-center rounded-full text-xs", step === s.id ? "bg-teal-100 text-teal-800" : "bg-white/15")}>{s.n}</span>
                {s.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[1fr_360px]">
        <main className="min-w-0">
          {step === "setup" && <SetupStep />}
          {step === "build" && <BuildStep />}
          {step === "balance" && <BalanceStep />}
          {step === "order" && <OrderStep />}
        </main>
        <aside className="lg:sticky lg:top-14 lg:self-start"><PanelSidebar /></aside>
      </div>
    </div>
  );
}
