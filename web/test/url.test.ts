import { describe, expect, it } from "vitest";
import { decodeState, encodeState } from "@/lib/url";
import type { PanelRow } from "@/lib/types";
import { CYTOF, IMC, index } from "./util";

const rows: PanelRow[] = [
  { id: "cd45", targetId: "cd45", name: "CD45", level: "very_high", clone: "HI30", custom: false, locked: 89, moduleIds: ["a", "b"] },
  { id: "custom:TOX", targetId: null, name: "TOX", level: "low", clone: null, custom: true, locked: null, moduleIds: [] },
  { id: "cd3e", targetId: "cd3e", name: "CD3ε", level: "high", clone: "UCHT1", custom: false, locked: null, moduleIds: ["a"] },
];

// v1 (pre-compression) share link for the same state, kept verbatim so old links stay decodable.
const v1 = (setup: typeof IMC) => Buffer.from(JSON.stringify({
  v: 1, s: [setup.modality, setup.species, setup.sampleType, setup.instrumentId, setup.viability ? 1 : 0, setup.barcoding ? 1 : 0], n: 40, b: 1,
  r: rows.map((r) => [r.id, r.targetId, r.name, r.level, r.clone, r.custom ? 1 : 0, r.locked, r.moduleIds]),
})).toString("base64url");

describe("url state", () => {
  it("round-trips setup, rows (incl. unicode names), sample count and balanced flag", () => {
    for (const setup of [IMC, CYTOF]) {
      const enc = encodeState({ setup, rows, nSamples: 40, balanced: true });
      expect(enc).toMatch(/^~[A-Za-z0-9_-]+$/); // v2 marker + base64url, safe in a hash
      const dec = decodeState(`#${enc}`)!;
      expect(dec.setup).toEqual(setup);
      expect(dec.rows).toEqual(rows.map((r) => ({ ...r, name: r.targetId ?? r.name }))); // names come from the catalogue; none here
      expect(dec.nSamples).toBe(40);
      expect(dec.balanced).toBe(true);
    }
  });
  it("with the catalogue index: names and default clones are rebuilt, and the link is short", () => {
    const idx = index();
    const setup = CYTOF;
    const cd45 = idx.cloneOptions("cd45", setup)[0].clone;
    const cd3e = idx.cloneOptions("cd3e", setup)[0].clone;
    const real: PanelRow[] = [
      { ...rows[0], name: idx.targetsById.get("cd45")!.name, clone: cd45 },
      rows[1],
      { ...rows[2], name: idx.targetsById.get("cd3e")!.name, clone: cd3e },
      { id: "cd4", targetId: "cd4", name: idx.targetsById.get("cd4")!.name, level: "high", clone: null, custom: true, locked: null, moduleIds: [] }, // custom conjugation
    ];
    const enc = encodeState({ setup, rows: real, nSamples: 20, balanced: false }, idx);
    expect(decodeState(enc, idx)!.rows).toEqual(real);
    // A non-default clone survives verbatim.
    const alt = idx.cloneOptions("cd45", setup)[1]?.clone;
    if (alt) {
      const dec = decodeState(encodeState({ setup, rows: [{ ...real[0], clone: alt }], nSamples: 1, balanced: false }, idx), idx)!;
      expect(dec.rows[0].clone).toBe(alt);
    }
    // 40 catalogue rows from modules should fit comfortably in a tweet-sized hash.
    const many: PanelRow[] = idx.modulesFor(setup).flatMap((m) => m.markers).filter((k) => k.target_id).slice(0, 60)
      .map((k) => ({ id: k.target_id!, targetId: k.target_id, name: k.target_name, level: k.abundance_level ?? "medium", clone: idx.cloneOptions(k.target_id!, setup)[0]?.clone ?? null, custom: false, locked: null, moduleIds: ["broad-immune-profiling"] }));
    const dedup = many.filter((r, i) => many.findIndex((x) => x.id === r.id) === i).slice(0, 40);
    expect(encodeState({ setup, rows: dedup, nSamples: 20, balanced: true }, idx).length).toBeLessThan(700);
  });
  it("still decodes v1 links", () => {
    for (const setup of [IMC, CYTOF]) {
      const dec = decodeState(`#${v1(setup)}`)!;
      expect(dec.setup).toEqual(setup);
      expect(dec.rows).toEqual(rows);
      expect(dec.nSamples).toBe(40);
    }
  });
  it("rejects garbage and empty hashes", () => {
    expect(decodeState("")).toBeNull();
    expect(decodeState("#")).toBeNull();
    expect(decodeState("#not-base64!!")).toBeNull();
    expect(decodeState("#~not-deflate")).toBeNull();
    expect(decodeState("#" + Buffer.from('{"v":2}').toString("base64url"))).toBeNull();
  });
});
