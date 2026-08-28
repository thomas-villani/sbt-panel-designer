/**
 * The engine client must fail safely: a worker that crashes, or never answers, rejects what is in flight (so the store
 * can show an error) and the next request runs on the main thread. Exercised with a fake Worker; the real one needs a
 * browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { index } from "./util";

type Handler = ((ev: { data: unknown }) => void) | null;
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: Handler = null;
  onerror: ((e: { message: string }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  posted: unknown[] = [];
  terminated = false;
  constructor() { FakeWorker.instances.push(this); }
  postMessage(m: unknown) { this.posted.push(m); }
  terminate() { this.terminated = true; }
}

const idx = index();
const build = { instrumentId: "cytof_xt", rows: [{ id: "cd45", label: "CD45", domain: [89, 141, 142], level: "high" as const }], reservedRoles: [] as string[] };

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
  vi.resetModules();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("engine client", () => {
  it("routes requests to the worker and resolves by id", async () => {
    const client = await import("@/lib/engine-client");
    client.initEngine(idx.bundles.instruments);
    expect(client.engineInWorker()).toBe(true);
    const w = FakeWorker.instances[0];
    expect(w.posted[0]).toMatchObject({ type: "init" });
    const p = client.balanceInWorker(build);
    const req = w.posted[1] as { id: number };
    w.onmessage!({ data: { id: req.id, result: { assignment: { cd45: 141 }, unassigned: [], warnings: [], rows: [], score: 0, objective: 0, stats: {} } } });
    expect((await p).assignment).toEqual({ cd45: 141 });
  });

  it("a worker crash rejects everything in flight and falls back to the main thread", async () => {
    const client = await import("@/lib/engine-client");
    client.initEngine(idx.bundles.instruments);
    const w = FakeWorker.instances[0];
    const p = client.balanceInWorker(build);
    w.onerror!({ message: "boom" });
    await expect(p).rejects.toThrow(/boom/);
    expect(w.terminated).toBe(true);
    expect(client.engineInWorker()).toBe(false);
    // The next request runs inline and still produces a real result.
    const r = await client.balanceInWorker(build);
    expect(r.assignment.cd45).not.toBeNull();
  });

  it("a request that never answers times out instead of hanging the UI", async () => {
    vi.useFakeTimers();
    const client = await import("@/lib/engine-client");
    client.initEngine(idx.bundles.instruments);
    const p = client.balanceInWorker(build);
    const failed = p.catch((e: Error) => e.message);
    vi.advanceTimersByTime(client.REQUEST_TIMEOUT_MS + 1);
    expect(await failed).toMatch(/did not answer/);
    expect(client.engineInWorker()).toBe(false);
  });

  it("re-initialising terminates the previous worker", async () => {
    const client = await import("@/lib/engine-client");
    client.initEngine(idx.bundles.instruments);
    client.initEngine(idx.bundles.instruments);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    expect(FakeWorker.instances[1].terminated).toBe(false);
  });

  it("the store surfaces a worker failure as engineError with the panel still editable", async () => {
    const { useStore } = await import("@/lib/store");
    useStore.setState({ rows: [], result: null, engineError: null });
    useStore.getState().init(idx.bundles);
    const w = FakeWorker.instances[0];
    useStore.getState().addTarget("cd45");
    await vi.waitFor(() => { if (!w.posted.some((m) => (m as { type: string }).type === "balance")) throw new Error("no request yet"); });
    w.onerror!({ message: "worker died" });
    await vi.waitFor(() => { if (!useStore.getState().engineError) throw new Error("not yet"); });
    expect(useStore.getState().engineError).toMatch(/worker died/);
    expect(useStore.getState().balancing).toBe(false);
    // "Try again" recovers on the main thread.
    await useStore.getState().balanceNow();
    expect(useStore.getState().engineError).toBeNull();
    expect(useStore.getState().result?.assignment.cd45).not.toBeNull();
  });
});
