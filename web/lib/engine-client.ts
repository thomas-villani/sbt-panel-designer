/**
 * Promise wrapper around the engine Web Worker. Falls back to the main thread when workers are unavailable, and again
 * after the worker dies: a crashed worker rejects everything in flight, so the store can show an error instead of
 * "checking…" forever, and the next request runs on the main thread.
 */
import type { BuildOptions, InstrumentBundle, OptimizerOptions, Result } from "@pd3/engine";

type Pending = { resolve: (r: Result) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();
let fallbackBundle: InstrumentBundle | null = null;

/** A balance takes < 200 ms; a request that has not answered in this long has a dead worker behind it. */
export const REQUEST_TIMEOUT_MS = 15_000;

function failAll(err: Error): void {
  for (const [id, p] of pending) { clearTimeout(p.timer); pending.delete(id); p.reject(err); }
}

/** Tear down the worker (if any) and run on the main thread from now on. */
function degrade(reason: string): void {
  if (worker) { try { worker.terminate(); } catch { /* ignore */ } }
  worker = null;
  failAll(new Error(reason));
}

export function initEngine(bundle: InstrumentBundle): void {
  fallbackBundle = bundle;
  if (worker) { try { worker.terminate(); } catch { /* ignore */ } worker = null; failAll(new Error("engine restarted")); }
  if (typeof Worker === "undefined") return;
  try {
    const w = new Worker(new URL("../workers/balance.worker.ts", import.meta.url));
    w.onmessage = (ev: MessageEvent<{ id: number; result?: Result; error?: string }>) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(ev.data.id);
      if (ev.data.error) p.reject(new Error(ev.data.error)); else p.resolve(ev.data.result!);
    };
    w.onerror = (e) => { console.error("engine worker error", e); degrade(`engine worker failed: ${e.message || "unknown error"}`); };
    w.onmessageerror = () => degrade("engine worker sent an unreadable message");
    w.postMessage({ type: "init", bundle });
    worker = w;
  } catch (e) {
    console.warn("engine worker unavailable, running on main thread", e);
    worker = null;
  }
}

/** True while requests go to a worker (false = main-thread fallback). For tests and diagnostics. */
export function engineInWorker(): boolean { return worker !== null; }

async function request(msg: Record<string, unknown>): Promise<Result> {
  if (!worker) {
    if (!fallbackBundle) throw new Error("engine not initialised");
    const eng = await import("@pd3/engine");
    const problem = eng.buildProblem(fallbackBundle, msg.build as BuildOptions);
    return msg.type === "balance"
      ? eng.balance(problem, msg.opts as OptimizerOptions)
      : eng.evaluate(problem, msg.assignment as Record<string, number | null>);
  }
  const id = ++seq;
  const w = worker;
  return new Promise<Result>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error("the engine did not answer in time"));
      // The worker is wedged: drop it so the next request runs inline instead of waiting again.
      if (worker === w) degrade("engine worker timed out");
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    w.postMessage({ ...msg, id });
  });
}

export function balanceInWorker(build: BuildOptions, opts?: OptimizerOptions): Promise<Result> {
  return request({ type: "balance", build, opts });
}

export function evaluateInWorker(build: BuildOptions, assignment: Record<string, number | null>): Promise<Result> {
  return request({ type: "evaluate", build, assignment });
}
