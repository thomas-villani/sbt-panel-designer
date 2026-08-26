"use client";
import { SAMPLE_TYPES, SPECIES } from "@/lib/data";
import { useStore } from "@/lib/store";
import { Button, H2, Tile } from "./ui";

export function SetupStep() {
  const idx = useStore((s) => s.idx)!;
  const setup = useStore((s) => s.setup);
  const setSetup = useStore((s) => s.setSetup);
  const setStep = useStore((s) => s.setStep);
  const instruments = idx.instruments.instruments.filter((i) => i.modality === setup.modality && i.current);
  const roles = idx.instruments.reserved[setup.modality];

  return (
    <div className="space-y-8">
      <section>
        <H2>What are you measuring?</H2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Tile label="Suspension cells (CyTOF)" sub="PBMC, blood, dissociated tissue" active={setup.modality === "suspension"} onClick={() => setSetup({ modality: "suspension" })} />
          <Tile label="Tissue imaging (IMC)" sub="FFPE or frozen sections on a Hyperion" active={setup.modality === "imaging"} onClick={() => setSetup({ modality: "imaging" })} />
        </div>
      </section>
      <section>
        <H2>Species</H2>
        <div className="flex flex-wrap gap-2">
          {SPECIES.map((s) => <Tile key={s.id} label={s.label} active={setup.species === s.id} onClick={() => setSetup({ species: s.id })} />)}
        </div>
      </section>
      <section>
        <H2>Sample</H2>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_TYPES[setup.modality].map((s) => <Tile key={s.id} label={s.label} active={setup.sampleType === s.id} onClick={() => setSetup({ sampleType: s.id })} />)}
        </div>
      </section>
      <section>
        <H2 hint="defaults to the current instrument for your application">Instrument</H2>
        <div className="flex flex-wrap gap-2">
          {instruments.map((i) => <Tile key={i.id} label={i.name} sub={`${i.channels.filter((c) => c.usable).length} usable channels`} active={setup.instrumentId === i.id} onClick={() => setSetup({ instrumentId: i.id })} />)}
        </div>
      </section>
      <section>
        <H2 hint="these reserve channels so antibodies never collide with them">Scaffolding</H2>
        <div className="space-y-2 text-sm">
          {roles.map((r) => {
            const fixed = r.role === "dna_intercalator" || r.role === "segmentation_kit";
            const on = fixed || (r.role === "viability_cisplatin" && setup.viability) || (r.role === "barcoding_pd" && setup.barcoding);
            const toggle = r.role === "viability_cisplatin" ? () => setSetup({ viability: !setup.viability }) : r.role === "barcoding_pd" ? () => setSetup({ barcoding: !setup.barcoding }) : undefined;
            if (!fixed && !toggle) return null;
            return (
              <label key={r.role} className="flex items-center gap-3">
                <input type="checkbox" checked={on} disabled={fixed} onChange={toggle} className="h-4 w-4 accent-teal-700" />
                <span>{r.label}</span>
                <span className="text-xs text-slate-500">channels {r.masses.join(", ")}{fixed ? " · always" : ""}</span>
              </label>
            );
          })}
        </div>
      </section>
      <Button variant="primary" size="lg" onClick={() => setStep("build")}>Choose markers →</Button>
    </div>
  );
}
