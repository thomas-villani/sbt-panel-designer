/// <reference lib="webworker" />
/** Runs the PD3 engine off the main thread. Protocol: init(bundle) once, then balance/evaluate requests by id. */
import { balance, buildProblem, evaluate } from "@pd3/engine";
import type { BuildOptions, InstrumentBundle, OptimizerOptions } from "@pd3/engine";

export type WorkerRequest =
  | { type: "init"; bundle: InstrumentBundle }
  | { type: "balance"; id: number; build: BuildOptions; opts?: OptimizerOptions }
  | { type: "evaluate"; id: number; build: BuildOptions; assignment: Record<string, number | null> };

let bundle: InstrumentBundle | null = null;

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg.type === "init") { bundle = msg.bundle; return; }
  try {
    if (!bundle) throw new Error("engine worker not initialised");
    const problem = buildProblem(bundle, msg.build);
    const result = msg.type === "balance" ? balance(problem, msg.opts) : evaluate(problem, msg.assignment);
    self.postMessage({ id: msg.id, result });
  } catch (e) {
    self.postMessage({ id: msg.id, error: e instanceof Error ? e.message : String(e) });
  }
};
