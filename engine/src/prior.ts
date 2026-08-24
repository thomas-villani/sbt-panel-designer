import type { AbundanceLevel } from "./types.js";

/**
 * Abundance prior v0: signal / tolerance in dual counts per abundance level.
 * Values are the medians of SBT's titrated suspension conjugates (PBMC, Helios/XT) within each level band
 * (bands: signal <60 low, <150 medium, <400 high, else very_high). Source: pdv2 S/T harvest, 527 conjugates, 2026-08.
 * IMC has no titrated data; the same levels are applied to the curated/kit-pill level (relative balance is what matters).
 */
export const ABUNDANCE_PRIOR: Record<AbundanceLevel, { signal: number; tolerance: number }> = {
  low: { signal: 30, tolerance: 5 },
  medium: { signal: 100, tolerance: 18 },
  high: { signal: 220, tolerance: 40 },
  very_high: { signal: 700, tolerance: 120 },
};

export const ABUNDANCE_LEVELS: AbundanceLevel[] = ["low", "medium", "high", "very_high"];

/** Prefer titrated values when present and non-placeholder (pdv2 placeholder = 100 / 1). */
export function signalTolerance(
  titrated: { signal?: number | null; tolerance?: number | null } | null | undefined,
  level: AbundanceLevel | null | undefined,
): { signal: number; tolerance: number; source: "titrated" | "prior" | "default" } {
  const s = titrated?.signal ?? null;
  const t = titrated?.tolerance ?? null;
  if (s != null && t != null && s > 0 && t > 0 && !(s === 100 && t === 1)) {
    return { signal: s, tolerance: t, source: "titrated" };
  }
  if (level && ABUNDANCE_PRIOR[level]) return { ...ABUNDANCE_PRIOR[level], source: "prior" };
  return { ...ABUNDANCE_PRIOR.medium, source: "default" };
}

export function levelFromSignal(signal: number): AbundanceLevel {
  if (signal < 60) return "low";
  if (signal < 150) return "medium";
  if (signal < 400) return "high";
  return "very_high";
}
