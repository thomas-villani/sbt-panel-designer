import { describe, expect, it } from "vitest";
import type { Result } from "@pd3/engine";
import { STEPS, STEP_IDS, landingStep, nextStep, stepDef, stepEnabled } from "@/lib/steps";
import type { PanelRow } from "@/lib/types";

const row: PanelRow = { id: "cd45", targetId: "cd45", name: "CD45", level: "high", clone: "HI30", custom: false, locked: null, moduleIds: [] };
const result = (unassigned: string[]) => ({ unassigned }) as unknown as Result;

describe("step registry", () => {
  it("lists every step once, in header order", () => {
    expect(STEPS.map((s) => s.id)).toEqual([...STEP_IDS]);
    expect(STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4]);
    expect(stepDef("balance").ownsNotice).toBe(true);
    expect(stepDef("build").ownsNotice).toBeUndefined();
  });

  it("gates Balance on markers and Order on a balanced panel", () => {
    const empty = { rows: [], balanced: false };
    expect(STEP_IDS.filter((s) => stepEnabled(s, empty))).toEqual(["setup", "build"]);
    expect(STEP_IDS.filter((s) => stepEnabled(s, { rows: [row], balanced: false }))).toEqual(["setup", "build", "balance"]);
    expect(STEP_IDS.filter((s) => stepEnabled(s, { rows: [row], balanced: true }))).toEqual([...STEP_IDS]);
    expect(stepEnabled("order", { rows: [], balanced: true })).toBe(false); // a cleared panel closes Order again
  });

  it("offers the one forward action for the mobile bar", () => {
    expect(nextStep("setup", { rows: [], balanced: false })).toEqual({ label: "Choose markers", to: "build" });
    expect(nextStep("build", { rows: [], balanced: false })).toBeNull();
    expect(nextStep("build", { rows: [row], balanced: false })?.label).toBe("Balance panel");
    expect(nextStep("build", { rows: [row], balanced: true })?.label).toBe("Balance");
    expect(nextStep("balance", { rows: [row], balanced: true, result: null })).toBeNull();
    expect(nextStep("balance", { rows: [row], balanced: true, result: result(["x"]) })).toBeNull();
    expect(nextStep("balance", { rows: [row], balanced: true, result: result([]) })).toEqual({ label: "Order", to: "order" });
    expect(nextStep("order", { rows: [row], balanced: true })).toBeNull();
  });

  it("lands a restored panel as far along as its content allows", () => {
    expect(landingStep({ rows: [], balanced: true })).toBe("setup");
    expect(landingStep({ rows: [row], balanced: false })).toBe("build");
    expect(landingStep({ rows: [row], balanced: true })).toBe("balance");
  });
});
