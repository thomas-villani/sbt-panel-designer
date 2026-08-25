import { describe, expect, it } from "vitest";
import { decodeState, encodeState } from "@/lib/url";
import type { PanelRow } from "@/lib/types";
import { CYTOF, IMC } from "./util";

const rows: PanelRow[] = [
  { id: "cd45", targetId: "cd45", name: "CD45", level: "very_high", clone: "HI30", custom: false, locked: 89, moduleIds: ["a", "b"] },
  { id: "custom:TOX", targetId: null, name: "TOX", level: "low", clone: null, custom: true, locked: null, moduleIds: [] },
  { id: "cd3e", targetId: "cd3e", name: "CD3ε", level: "high", clone: "UCHT1", custom: false, locked: null, moduleIds: ["a"] },
];

describe("url state", () => {
  it("round-trips setup, rows (incl. unicode names), sample count and balanced flag", () => {
    for (const setup of [IMC, CYTOF]) {
      const enc = encodeState({ setup, rows, nSamples: 40, balanced: true });
      expect(enc).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, safe in a hash
      const dec = decodeState(`#${enc}`)!;
      expect(dec.setup).toEqual(setup);
      expect(dec.rows).toEqual(rows);
      expect(dec.nSamples).toBe(40);
      expect(dec.balanced).toBe(true);
    }
  });
  it("rejects garbage and empty hashes", () => {
    expect(decodeState("")).toBeNull();
    expect(decodeState("#")).toBeNull();
    expect(decodeState("#not-base64!!")).toBeNull();
    expect(decodeState("#" + Buffer.from('{"v":2}').toString("base64url"))).toBeNull();
  });
});
