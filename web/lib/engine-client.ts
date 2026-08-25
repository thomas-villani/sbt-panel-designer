/** Promise wrapper around the engine Web Worker. Falls back to the main thread if workers are unavailable. */
import type { BuildOptions, InstrumentBundle, OptimizerOptions, Result } from "@pd3/engine";

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: Result) => void; reject: (e: Error) => void }>();
let fallbackBundle: InstrumentBundle | null = null;

export function initEngine(bundle: InstrumentBundle): void {
  fallbackBundle = bundle;
  if (typeof Worker === "undefined") return;
  try {
    worker = new Worker(new URL("../workers/balance.worker.ts", import.meta.url));
    worker.onmessage = (ev: MessageEvent<{ id: number; result?: Result; error?: string }>) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      pending.delete(ev.data.id);
      if (ev.data.error) p.reject(new Error(ev.data.error)); else p.resolve(ev.data.result!);
    };
    worker.onerror = (e) => { console.error("engine worker error", e); };
    worker.postMessage({ type: "init", bundle });
  } catch (e) {
    console.warn("engine worker unavailable, running on main thread", e);
    worker = null;
  }
}

async function request(msg: Record<string, unknown>): Promise<Result> {
  if (!worker) {
    const eng = await import("@pd3/engine");
    const problem = eng.buildProblem(fallbackBundle!, msg.build as BuildOptions);
    return msg.type === "balance"
      ? eng.balance(problem, msg.opts as OptimizerOptions)
      : eng.evaluate(problem, msg.assignment as Record<string, number | null>);
  }
  const id = ++seq;
  return new Promise<Result>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ ...msg, id });
  });
}

export function balanceInWorker(build: BuildOptions, opts?: OptimizerOptions): Promise<Result> {
  return request({ type: "balance", build, opts });
}

export function evaluateInWorker(build: BuildOptions, assignment: Record<string, number | null>): Promise<Result> {
  return request({ type: "evaluate", build, assignment });
}
