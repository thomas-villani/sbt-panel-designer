import { describe, expect, it } from "vitest";
import { balance, buildProblem } from "@pd3/engine";
import { conjugationIssues } from "@/lib/conjugation";
import { reservedRoles, rowSpec } from "@/lib/data";
import type { PanelRow } from "@/lib/types";
import { CYTOF, IMC, index, rowsFromModule } from "./util";

const idx = index();

function balanced(rows: PanelRow[], setup: typeof IMC) {
  const problem = buildProblem(idx.instruments, {
    instrumentId: setup.instrumentId, rows: rows.map((r) => rowSpec(idx, r, setup)),
    reservedRoles: reservedRoles(setup), extraReserved: setup.blocked,
  });
  return balance(problem, { seed: 1 });
}

describe("custom-conjugation warnings", () => {
  it("flags a marker that has no conjugate for this modality, on the channel the optimiser gave it", () => {
    // NK cells in tissue: CD56 is required for the gate but is only sold for CyTOF, so it lands on an X8 metal.
    const rows = rowsFromModule(idx, "ct-human-nk", IMC);
    const cd56 = rows.find((r) => r.id === "cd56ncam")!;
    expect(cd56.clone).toBeNull();
    const result = balanced(rows, IMC);

    const issues = conjugationIssues(idx, rows, result, IMC);
    expect(issues).toHaveLength(1);
    expect(issues[0].rowId).toBe("cd56ncam");
    expect(issues[0].kind).toBe("no_conjugate");
    expect(issues[0].detail).toBe("Sold for CyTOF only.");
    expect(issues[0].channel).toBe(idx.instrument(IMC.instrumentId).channels.find((c) => c.mass === result.assignment.cd56ncam)!.label);
    expect(issues[0].fix).toBeNull();
    // The engine itself is happy: this is exactly the gap the check exists to close.
    expect(result.warnings.filter((w) => w.severity !== "info")).toHaveLength(0);
  });

  it("says nothing when every marker has a catalogue vial on its channel", () => {
    const rows = rowsFromModule(idx, "human-pbmc-lineage", CYTOF);
    expect(conjugationIssues(idx, rows, balanced(rows, CYTOF), CYTOF)).toEqual([]);
  });

  it("flags a clone locked onto a channel it is not sold on, and offers a free catalogue channel", () => {
    const rows = rowsFromModule(idx, "human-pbmc-lineage", CYTOF);
    const row = rows.find((r) => r.clone && idx.cloneOptions(r.targetId!, CYTOF).find((o) => o.clone === r.clone)!.metals.length > 0)!;
    const sold = new Set(idx.candidates(row.targetId!, CYTOF).filter((c) => c.clone === row.clone).map((c) => c.mass));
    const elsewhere = idx.instrument(CYTOF.instrumentId).channels.find((c) => c.usable && !sold.has(c.mass) && ![191, 193, 194, 195, 198].includes(c.mass))!;
    row.locked = elsewhere.mass;

    const issues = conjugationIssues(idx, rows, balanced(rows, CYTOF), CYTOF);
    expect(issues.map((i) => i.rowId)).toEqual([row.id]);
    expect(issues[0].kind).toBe("metal_not_sold");
    expect(issues[0].channel).toBe(elsewhere.label);
    expect(sold.has(issues[0].fix!.mass)).toBe(true);
  });

  it("keeps quiet about a custom conjugation the user asked for", () => {
    const rows = rowsFromModule(idx, "human-pbmc-lineage", CYTOF);
    rows[0].clone = null; // "custom conjugation" picked in the clone dropdown
    rows[0].custom = true;
    expect(conjugationIssues(idx, rows, balanced(rows, CYTOF), CYTOF)).toEqual([]);
  });
});
