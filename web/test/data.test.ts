import { describe, expect, it } from "vitest";
import { channelBudget, levelFromSignal, markerPlan, normKey, reservedRoles, rowSpec, titratedST } from "@/lib/data";
import { CYTOF, IMC, index, rowsFromModule } from "./util";

const idx = index();

describe("normKey and search", () => {
  it("folds Greek, phospho and punctuation", () => {
    expect(normKey("CD3ε")).toBe("cd3e");
    expect(normKey("Phospho-STAT3 [Y705]")).toBe("pstat3y705");
    expect(normKey("PD-L1")).toBe("pdl1");
  });
  it("resolves aliases and ranks prefix matches first", () => {
    expect(idx.search("PD-L1", IMC, 3)[0].name).toBe("CD274/PD-L1");
    expect(idx.search("granzyme", IMC, 3)[0].name).toBe("Granzyme B");
    expect(idx.search("CD8", CYTOF, 5)[0].name).toMatch(/^CD8/);
    expect(idx.search("", IMC)).toEqual([]);
  });
  it("only returns targets sold for the application", () => {
    for (const t of idx.search("cd", IMC, 50)) expect(t.applications).toContain("imaging");
  });
});

describe("clone defaulting", () => {
  it("prefers sample-validated clones on imaging, then the clone with most conjugates", () => {
    const opts = idx.cloneOptions("cd45", IMC);
    expect(opts.length).toBeGreaterThan(0);
    for (let i = 1; i < opts.length; i++) {
      const a = opts[i - 1], b = opts[i];
      expect(Number(a.sampleValidated) >= Number(b.sampleValidated)).toBe(true);
      if (a.sampleValidated === b.sampleValidated) expect(a.conjugates.length >= b.conjugates.length).toBe(true);
    }
    for (const c of opts.flatMap((o) => o.conjugates)) {
      expect(c.application).toBe("imaging");
      expect(c.reactivity).toContain("human");
    }
  });
  it("mouse setup never returns human-only clones; 'other' species accepts anything", () => {
    const mouse = idx.cloneOptions("cd45", { ...CYTOF, species: "mouse" });
    for (const o of mouse) expect(o.reactivity).toContain("mouse");
    const any = idx.cloneOptions("cd45", { ...CYTOF, species: "other" });
    expect(any.length).toBeGreaterThanOrEqual(mouse.length);
  });
});

describe("modules and suggestions", () => {
  it("filters modules by application and species", () => {
    const imc = idx.modulesFor(IMC);
    expect(imc.length).toBeGreaterThan(20);
    for (const m of imc) {
      expect(["imaging", "both"]).toContain(m.application);
      if (m.species.length) expect(m.species).toContain("human");
    }
    expect(idx.modulesFor(IMC).map((m) => m.name)).toContain("Tissue architecture");
    expect(idx.modulesFor(CYTOF).map((m) => m.id)).toContain("human-pbmc-lineage");
  });
  it("suggests catalogue markers not already in the panel", () => {
    const rows = rowsFromModule(idx, idx.modulesFor(IMC).find((m) => m.name === "Basic immune")!.id, IMC);
    const s = idx.suggestNext(rows, IMC);
    expect(s.length).toBeGreaterThan(0);
    const have = new Set(rows.map((r) => r.targetId));
    for (const x of s) expect(have.has(x.targetId)).toBe(false);
    expect(idx.suggestNext([], IMC)).toEqual([]);
  });
});

describe("row specs, prior and budget", () => {
  it("levelFromSignal uses the ETL thresholds", () => {
    expect(levelFromSignal(10)).toBe("low");
    expect(levelFromSignal(100)).toBe("medium");
    expect(levelFromSignal(300)).toBe("high");
    expect(levelFromSignal(1000)).toBe("very_high");
    expect(levelFromSignal(null)).toBeNull();
  });
  it("rowSpec exposes the clone's masses and uses titration only when it agrees with the level", () => {
    const opts = idx.cloneOptions("cd45", CYTOF);
    const st = titratedST(opts[0].conjugates)!;
    expect(st.signal).toBeGreaterThan(0);
    const level = levelFromSignal(st.signal)!;
    const row = { id: "cd45", targetId: "cd45", name: "CD45", level, clone: opts[0].clone, custom: false, locked: null, moduleIds: [] };
    const spec = rowSpec(idx, row, CYTOF);
    expect(spec.signal).toBe(st.signal);
    expect(spec.metals).toEqual(opts[0].conjugates.map((c) => c.mass));
    expect(spec.allowCustom).toBe(false);
    const overridden = rowSpec(idx, { ...row, level: level === "low" ? "very_high" : "low" }, CYTOF);
    expect(overridden.signal).toBeNull(); // user override wins: the prior for the chosen level applies
  });
  it("custom rows allow any labelling-kit metal", () => {
    const spec = rowSpec(idx, { id: "custom:TOX", targetId: null, name: "TOX", level: "medium", clone: null, custom: true, locked: null, moduleIds: [] }, IMC);
    expect(spec.metals).toEqual([]);
    expect(spec.allowCustom).toBe(true);
  });
  it("reserved roles and channel budget follow the setup toggles", () => {
    expect(reservedRoles(IMC)).toEqual(["dna_intercalator", "segmentation_kit"]);
    expect(reservedRoles({ ...IMC, segmentation: false })).toEqual(["dna_intercalator"]);
    expect(channelBudget(idx, { ...IMC, segmentation: false })).toBe(44);
    expect(channelBudget(idx, { ...IMC, blocked: [175, 176] })).toBe(39);
    expect(reservedRoles(CYTOF)).toEqual(["dna_intercalator", "viability_cisplatin"]);
    expect(reservedRoles({ ...CYTOF, barcoding: true })).toContain("barcoding_pd");
    const usable = (id: string) => new Set(idx.instrument(id).channels.filter((c) => c.usable).map((c) => c.mass));
    const budget = (id: string, reserved: number[]) => [...usable(id)].filter((m) => !reserved.includes(m)).length;
    expect(channelBudget(idx, IMC)).toBe(budget("hyperion_xti", [191, 193, 195, 196, 198]));
    expect(channelBudget(idx, IMC)).toBe(41); // 45 detection channels - 3 segmentation kit - 193Ir (191Ir is not in the XTi curve, so the intercalator costs one channel, not two)
    expect(channelBudget(idx, CYTOF)).toBe(budget("cytof_xt", [191, 193, 194, 195, 198]));
    expect(channelBudget(idx, { ...CYTOF, viability: false })).toBe(budget("cytof_xt", [191, 193]));
  });
});

describe("cell-type modules and module search", () => {
  it("cell-type modules carry a definition and lineage negatives that resolve to catalogue targets", () => {
    const ct = idx.modulesFor(CYTOF).filter((m) => m.category === "celltype");
    expect(ct.length).toBeGreaterThanOrEqual(20);
    for (const m of ct) {
      expect(m.definition).toBeTruthy();
      expect(m.aliases.length).toBeGreaterThan(0);
      for (const k of m.markers) expect(k.in_catalogue).toBe(true);
    }
    const dc = ct.find((m) => m.id === "ct-human-dc")!;
    expect(dc.markers.filter((k) => k.polarity === "neg").map((k) => k.target_id)).toEqual(["cd3e", "cd19", "cd14", "cd56ncam"]);
    expect(idx.modulesFor(IMC).some((m) => m.id === "ct-human-pdc")).toBe(false); // suspension-only cell type
    expect(idx.modulesFor(IMC).filter((m) => m.category === "celltype").length).toBeGreaterThanOrEqual(14);
    // A cell type whose own definition needs a marker with no IMC conjugate is hidden, not shown with a hole in it:
    // Dendritic cells cannot call pDCs without CD123, T-cell memory needs CCR7, plasmablasts need CD138.
    for (const id of ["ct-human-dc", "ct-human-t-memory", "ct-human-plasmablasts"]) {
      expect(idx.modulesFor(CYTOF).some((m) => m.id === id)).toBe(true);
      expect(idx.modulesFor(IMC).some((m) => m.id === id)).toBe(false);
    }
    expect(idx.modulesFor({ ...CYTOF, species: "mouse" }).some((m) => m.id === "ct-mouse-nk")).toBe(true);
  });
  it("searchModules finds cell types by name and alias, scoped to the setup", () => {
    expect(idx.searchModules("dendritic", CYTOF)[0].id).toBe("ct-human-dc");
    expect(idx.searchModules("Dendritic cell", CYTOF)[0].id).toBe("ct-human-dc");
    expect(idx.searchModules("pDC", CYTOF)[0].id).toBe("ct-human-pdc");
    expect(idx.searchModules("NK cells", CYTOF)[0].id).toBe("ct-human-nk");
    expect(idx.searchModules("treg", CYTOF).map((m) => m.id)).toContain("ct-human-treg");
    expect(idx.searchModules("macrophage", IMC)[0].id).toBe("ct-human-macrophages");
    expect(idx.searchModules("pDC", IMC)).toEqual([]);
    expect(idx.searchModules("pDC", IMC, 3, true)[0].id).toBe("ct-human-pdc"); // fallback: exists for suspension
    expect(idx.searchModules("nk cells", IMC)[0].id).toBe("ct-human-nk");
    expect(idx.searchModules("c", CYTOF)).toEqual([]); // too short
    expect(idx.searchModules("io", IMC).map((m) => m.name)).toContain("Immuno-oncology (31-marker master panel)"); // 2 chars: topic aliases
    expect(idx.searchModules("exhaustion", IMC).map((m) => m.name)).toContain("T-cell exhaustion");
  });
  it("markerPlan: unsold recommended markers are skipped, unsold required ones become custom", () => {
    const dc = idx.modulesById.get("ct-human-dc")!;
    const by = (name: string) => dc.markers.find((k) => k.target_name.startsWith(name))!;
    expect(markerPlan(by("CD123"), CYTOF)).toBe("catalogue");
    expect(markerPlan(by("CD123"), IMC)).toBe("skip"); // recommended, suspension only
    expect(markerPlan(by("CD141"), CYTOF)).toBe("skip"); // optional
    const nk = idx.modulesById.get("ct-human-nk")!;
    expect(markerPlan(nk.markers.find((k) => k.target_name.startsWith("CD56"))!, IMC)).toBe("custom"); // required, suspension only
  });
});

describe("suggestions respect the modality", () => {
  it("never suggests a marker that is not sold for the current application", () => {
    const rows = rowsFromModule(idx, "ct-human-dc", IMC);
    for (const s of idx.suggestNext(rows, IMC)) expect(idx.targetsById.get(s.targetId)!.applications).toContain("imaging");
  });
});
