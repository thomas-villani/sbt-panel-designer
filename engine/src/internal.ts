/**
 * Implementation details behind the public API in index.ts: the PO model, the optimiser phases, the explanation
 * builder and the remaining tuning constants. Imported by the engine's own tests and by experiments; not part of the
 * versioned surface (ENGINE_VERSION) and free to change.
 */
export { Model, NONE, channelUniverse, dimness, mechanismOf, type DuplicateLock } from "./po-model";
export { greedy, augment, descend, anneal, optimize, mulberry32 } from "./optimizer";
export { buildResult, bestMoveFor, type ResultNotes } from "./explain";
export { DIM_T, DIM_SCALE, TINY_DOMAIN, MAX_DESCENT_PASSES, GIVEN_MENTION } from "./tuning";
