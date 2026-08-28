import { describe, expect, it } from "vitest";
import { deflateSync, strToU8 } from "fflate";
import { decodeState, decodeStateResult, encodeState } from "@/lib/url";
import type { PanelRow, Setup } from "@/lib/types";
import { CYTOF, IMC, index } from "./util";

const rows: PanelRow[] = [
  { id: "cd45", targetId: "cd45", name: "CD45", level: "very_high", clone: "HI30", custom: false, locked: 89, moduleIds: ["a", "b"], clonePinned: true },
  { id: "custom:TOX", targetId: null, name: "TOX", level: "low", clone: null, custom: true, locked: null, moduleIds: [] },
  { id: "cd3e", targetId: "cd3e", name: "CD3ε", level: "high", clone: "UCHT1", custom: false, locked: null, moduleIds: ["a"] }, // free: the optimiser may swap clones
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
      expect(dec.rows).toEqual(rows.map((r) => (r.clone ? { ...r, clonePinned: true } : r))); // v1 clones were explicit choices
      expect(dec.nSamples).toBe(40);
    }
  });
  it("rejects garbage and empty hashes, and says which it was", () => {
    expect(decodeState("")).toBeNull();
    expect(decodeState("#")).toBeNull();
    expect(decodeState("#not-base64!!")).toBeNull();
    expect(decodeState("#~not-deflate")).toBeNull();
    expect(decodeState("#" + Buffer.from('{"v":2}').toString("base64url"))).toBeNull();
    expect(decodeStateResult("")).toEqual({ ok: false, reason: "empty" });
    expect(decodeStateResult("#~not-deflate")).toEqual({ ok: false, reason: "unreadable" });
    expect(decodeStateResult("#" + Buffer.from('{"v":2}').toString("base64url"))).toEqual({ ok: false, reason: "unsupported_version" });
    // A future v3 tuple: not a crash, not an empty panel, an explicit "newer than me".
    const future = "~" + Buffer.from(deflateSync(strToU8(JSON.stringify([3, [], 1, 0, []])))).toString("base64url");
    expect(decodeStateResult(future)).toEqual({ ok: false, reason: "unsupported_version" });
  });
  it("keeps a catalogue row's custom flag when it disagrees with 'no clone' (a pinned clone on a metal it is not sold on)", () => {
    const idx = index();
    const pinnedCustom: PanelRow = { id: "cd45", targetId: "cd45", name: idx.targetsById.get("cd45")!.name, level: "high", clone: idx.cloneOptions("cd45", CYTOF)[0].clone, clonePinned: true, custom: true, locked: 89, moduleIds: [] };
    const dec = decodeState(encodeState({ setup: CYTOF, rows: [pinnedCustom], nSamples: 1, balanced: false }, idx), idx)!;
    expect(dec.rows[0]).toEqual(pinnedCustom);
    // and the bit costs nothing when it is at its default
    const plain = encodeState({ setup: CYTOF, rows: [{ ...pinnedCustom, custom: false }], nSamples: 1, balanced: false }, idx);
    expect(decodeState(plain, idx)!.rows[0].custom).toBe(false);
  });
  it("stamps the catalogue version and reports drift", () => {
    const idx = index();
    const enc = encodeState({ setup: CYTOF, rows: [], nSamples: 1, balanced: false }, idx);
    const r = decodeStateResult(enc, idx);
    expect(r.ok && r.doc.catalogVersion).toBe(idx.bundles.catalog.version);
    expect(r.ok && r.drift).toEqual({ catalogChanged: false, unknownTargets: [], resetFields: [] });
    const old = decodeStateResult(encodeState({ setup: CYTOF, rows: [{ id: "nope", targetId: "nope", name: "Nope", level: "medium", clone: null, custom: true, locked: null, moduleIds: [] }], nSamples: 1, balanced: false, catalogVersion: "1999-01-01.0" }), idx);
    expect(old.ok && old.drift).toEqual({ catalogChanged: true, unknownTargets: ["nope"], resetFields: [] });
  });
  it("validates the setup against the bundle: an unknown instrument falls back to the modality default and releases pins", () => {
    const idx = index();
    const bad: Setup = { ...IMC, instrumentId: "hyperion_9000", blocked: [999, 141], extraMetals: [999] };
    const r = decodeStateResult(encodeState({ setup: bad, rows: [{ ...rows[0], locked: 141 }], nSamples: 1, balanced: false }), idx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.setup.instrumentId).toBe("hyperion_xti");
    expect(r.doc.setup.blocked).toEqual([141]);
    expect(r.doc.setup.extraMetals).toBeUndefined();
    expect(r.doc.rows[0].locked).toBeNull();
    expect(r.drift.resetFields).toEqual(expect.arrayContaining(["instrumentId", "blocked", "extraMetals"]));
    // an instrument of the wrong modality is just as wrong
    const wrong = decodeStateResult(encodeState({ setup: { ...IMC, instrumentId: "cytof_xt" }, rows: [], nSamples: 1, balanced: false }), idx);
    expect(wrong.ok && wrong.doc.setup.instrumentId).toBe("hyperion_xti");
    // without a bundle nothing can be validated, and nothing is invented
    expect(decodeState(encodeState({ setup: bad, rows: [], nSamples: 1, balanced: false }))!.setup.instrumentId).toBe("hyperion_9000");
  });
});

it("v2 carries an accepted-spill reason and drops it when empty", async () => {
  const { encodeState, decodeState } = await import("@/lib/url");
  const setup = { modality: "suspension", species: "human", sampleType: "pbmc", instrumentId: "cytof_xt", viability: true, barcoding: false, segmentation: true, blocked: [] as number[] } as Setup;
  const row = { id: "cd4", targetId: "cd4", name: "CD4", level: "medium" as const, clone: "RPA-T4", custom: false, locked: null, moduleIds: [], accepted: "CD4 and CD19 never co-express" };
  const st = decodeState(encodeState({ setup, rows: [row], nSamples: 1, balanced: false }))!;
  expect(st.rows[0].accepted).toBe("CD4 and CD19 never co-express");
  const plain = decodeState(encodeState({ setup, rows: [{ ...row, accepted: null }], nSamples: 1, balanced: false }))!;
  expect(plain.rows[0].accepted).toBeUndefined();
});

describe("url state: setup extras (viability mode, opted-in metals)", () => {
  it("round-trips the viability reagent and opted-in metals, and leaves them off the link at their defaults", () => {
    const base: Setup = { ...CYTOF, viability: true, barcoding: false, segmentation: true, blocked: [] };
    const plain = encodeState({ setup: base, rows: [], nSamples: 1, balanced: false });
    const rh = encodeState({ setup: { ...base, viabilityMode: "rh103" }, rows: [], nSamples: 1, balanced: false });
    const cd = encodeState({ setup: { ...IMC, extraMetals: [111, 112] }, rows: [], nSamples: 1, balanced: false });
    expect(decodeState(`#${plain}`)!.setup.viabilityMode).toBeUndefined();
    expect(decodeState(`#${rh}`)!.setup.viabilityMode).toBe("rh103");
    expect(decodeState(`#${cd}`)!.setup.extraMetals).toEqual([111, 112]);
    expect(rh.length).toBeGreaterThan(plain.length); // the default really is dropped
    expect(decodeState(`#${encodeState({ setup: { ...base, viabilityMode: "pt" }, rows: [], nSamples: 1, balanced: false })}`)!.setup.viabilityMode).toBeUndefined();
  });
});

describe("module references", () => {
  it("translates legacy kit slugs in old links to the stable kit id", async () => {
    const idx = index();
    const mdipa = idx.modulesBySlug.get("direct-immune-profiling-assay-mdipa")!;
    expect(mdipa.id).toBe("kit-201334");
    const doc = { setup: CYTOF, nSamples: 20, balanced: false, rows: [{ ...rows[2], moduleIds: [mdipa.slug, mdipa.id, "not-a-module"] }] };
    const res = decodeStateResult(`#${encodeState(doc, idx)}`, idx);
    expect(res.ok && res.doc.rows[0].moduleIds).toEqual([mdipa.id, "not-a-module"]);
  });
});
