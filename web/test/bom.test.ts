import { describe, expect, it } from "vitest";
import { balance, buildProblem } from "@pd3/engine";
import { accessories, bomCsv, buildBom } from "@/lib/bom";
import { reservedRoles, rowSpec } from "@/lib/data";
import { CYTOF, IMC, index, rowsFromModule } from "./util";

const idx = index();

function balanced(moduleId: string, setup: typeof IMC) {
  const rows = rowsFromModule(idx, moduleId, setup);
  const problem = buildProblem(idx.instruments, { instrumentId: setup.instrumentId, rows: rows.map((r) => rowSpec(idx, r, setup)), reservedRoles: reservedRoles(setup) });
  return { rows, result: balance(problem, { seed: 1 }) };
}

describe("BOM", () => {
  it("resolves a SKU for every catalogue row of a balanced IMC panel and sizes by slides", () => {
    const m = idx.modulesFor(IMC).find((x) => x.name === "Basic immune")!;
    const { rows, result } = balanced(m.id, IMC);
    const bom = buildBom(idx, rows, result, IMC, 40);
    expect(bom).toHaveLength(rows.length);
    for (const l of bom) {
      expect(l.sku).not.toBeNull();
      expect(l.conjugate!.mass).toBe(result.assignment[l.row.id]);
      expect(l.conjugate!.clone).toBe(l.row.clone);
      expect(l.qty).toBeGreaterThanOrEqual(1);
    }
    const one = buildBom(idx, rows, result, IMC, 1);
    for (const l of one) expect(l.qty).toBe(1);
  });
  it("suspension vials cover the sample count with tests formats", () => {
    const { rows, result } = balanced("human-pbmc-lineage", CYTOF);
    for (const n of [1, 25, 100, 250]) {
      for (const l of buildBom(idx, rows, result, CYTOF, n)) {
        if (l.sku?.format?.unit !== "tests") continue; // a few conjugates are sold in µl/µg only
        expect(l.qty * l.sku.format.qty).toBeGreaterThanOrEqual(n);
      }
    }
  });
  it("explains rows without a catalogue conjugate instead of dropping them", () => {
    const rows = [{ id: "custom:TOX", targetId: null, name: "TOX", level: "medium" as const, clone: null, custom: true, locked: null, moduleIds: [] }];
    const bom = buildBom(idx, rows, null, IMC, 10);
    expect(bom[0].sku).toBeNull();
    expect(bom[0].note).toMatch(/custom/i);
  });
  it("lists accessories from the reserved roles and writes a parseable CSV", () => {
    expect(accessories(idx, IMC, reservedRoles(IMC)).map((a) => a.label)).toEqual(["DNA intercalator (Ir)", "Cell segmentation kit (Pt)"]);
    const { rows, result } = balanced("human-pbmc-lineage", CYTOF);
    const csv = bomCsv(buildBom(idx, rows, result, CYTOF, 20), CYTOF);
    const lines = csv.split("\n");
    expect(lines[0]).toMatch(/^# PD3 panel/);
    expect(lines[1].split(",")).toHaveLength(10);
    expect(lines).toHaveLength(rows.length + 2);
  });
});
