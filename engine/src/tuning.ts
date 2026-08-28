/**
 * Every tuning constant the engine uses, in one place. Changing one changes only how the engine advises,
 * never what it can represent; each carries the rationale for its value.
 */

// Calibrated 2026-08-27 against SBT's own kits run on their kit metals: MDIPA peaks at 1.75 (CD16 148Nd oxide into
// TCRgd 164Dy), the Immuno-oncology master panel at 0.76, most kits below 0.5. A validated product must not read as
// broken, so "worth checking" starts where the spill equals the tolerance and "must fix" at twice it.
/** received / T above this -> warning */
export const SPILL_WARN = 1.0;
/** received / T at or above this -> critical */
export const SPILL_CRIT = 2.0;
/** rows with tolerance below this are "dim": a dim row on a bright_only channel earns a warning */
export const DIM_T = 10;
/** dimness(T) = 1/(1 + T/DIM_SCALE): the tolerance at which the sensitivity term is halved */
export const DIM_SCALE = 10;
/** greedy seeds rows with at most this many channels first - they have the least room to be repaired later */
export const TINY_DOMAIN = 2;
/** local descent gives up after this many improving passes (a safety net; real panels converge in a few dozen) */
export const MAX_DESCENT_PASSES = 500;
/** a row's outgoing spill is mentioned in its reasons once it costs this fraction of the recipient's tolerance */
export const GIVEN_MENTION = 0.1;
