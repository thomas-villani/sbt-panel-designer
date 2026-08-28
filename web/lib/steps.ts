/**
 * The designer's steps, in one place: order, labels, when a step is reachable, where "next" goes and where a
 * restored panel lands. Designer.tsx maps ids to views; the store, the header nav and the mobile bar all read this.
 */
import type { Result } from "@pd3/engine";
import type { PanelRow } from "./types";

export const STEP_IDS = ["setup", "build", "balance", "order"] as const;
export type Step = (typeof STEP_IDS)[number];

export interface StepDef {
  id: Step;
  label: string;
  /** 1-based position shown in the header. */
  n: number;
  /** The step renders the store notice itself (Balance shows it inline, next to the fixes it refers to). */
  ownsNotice?: true;
}

export const STEPS: readonly StepDef[] = [
  { id: "setup", label: "Setup", n: 1 },
  { id: "build", label: "Build", n: 2 },
  { id: "balance", label: "Balance", n: 3, ownsNotice: true },
  { id: "order", label: "Order", n: 4 },
];

export function stepDef(id: Step): StepDef {
  return STEPS.find((s) => s.id === id)!;
}

export interface StepContext {
  rows: readonly PanelRow[];
  balanced: boolean;
  result?: Result | null;
}

/** Setup and Build are always open; Balance needs markers; Order needs a balanced panel. */
export function stepEnabled(step: Step, ctx: StepContext): boolean {
  switch (step) {
    case "setup":
    case "build":
      return true;
    case "balance":
      return ctx.rows.length > 0;
    case "order":
      return ctx.rows.length > 0 && ctx.balanced;
  }
}

/** The one forward action offered on small screens, or null when the current step has nothing to hand on to. */
export function nextStep(step: Step, ctx: StepContext): { label: string; to: Step } | null {
  switch (step) {
    case "setup":
      return { label: "Choose markers", to: "build" };
    case "build":
      return ctx.rows.length ? { label: ctx.balanced ? "Balance" : "Balance panel", to: "balance" } : null;
    case "balance":
      return ctx.result && !ctx.result.unassigned.length ? { label: "Order", to: "order" } : null;
    case "order":
      return null;
  }
}

/** Where a restored / decoded panel opens: as far along as its content allows. */
export function landingStep(doc: { rows: readonly unknown[]; balanced: boolean }): Step {
  return doc.rows.length ? (doc.balanced ? "balance" : "build") : "setup";
}
