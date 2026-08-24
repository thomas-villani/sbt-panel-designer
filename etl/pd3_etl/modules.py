"""Build data/build/modules.json: SBT panel kits (captured from pdv2) + curated modules, resolved against the catalogue.

Module marker fields:
  target_id/target_name  resolved through the catalogue's alias registry
  role                   required | recommended | optional  (kits: all 'required')
  clone, metal, mass     kit assignment (SBT's own metal choice = the "kit-locked" default); curated modules: usually null
  signal, tolerance      suspension kits carry titrated values (abundance_factor / important); IMC kits carry the 33/66 pill
  abundance_level        low | medium | high | very_high  (from titrated signal quantiles, or the IMC pill, or curated hint)
  conjugate_id           matching catalogue conjugate (same target, clone, metal, application) or null
  catalogue_metals       metals on which this target+clone is sold for this application (what the optimiser may choose)
"""
from __future__ import annotations

import json
import re
from collections import defaultdict

import yaml

from . import BUILD, CURATED, RAW_PDV2
from .names import clean, norm_key
from .util import write_json

PDV2_REACTIVITY = {1: "human", 2: "mouse", 3: "rat", 4: "rabbit"}
PDV2_INSTRUMENT = {1: "helios", 2: "cytof1", 3: "cytof2", 4: "cytof_xt", 5: "hyperion", 6: "hyperion_plus", 7: "hyperion_xti"}
NON_ANTIBODY = re.compile(r"^ICSK-\d$", re.I)

# Titrated-signal quantile cut points (dual counts, PBMC). Derived from the suspension harvest: IQR 58-374, 95th pct 1303.
ABUNDANCE_CUTS = [(60, "low"), (150, "medium"), (400, "high")]  # else very_high
IMC_PILL = {33: "low", 66: "medium", 100: "high"}


def abundance_from_signal(signal: float | None) -> str | None:
    if signal is None:
        return None
    for cut, level in ABUNDANCE_CUTS:
        if signal < cut:
            return level
    return "very_high"


class CatalogIndex:
    def __init__(self, cat: dict):
        self.targets = {t["id"]: t for t in cat["targets"]}
        self.key_to_id: dict[str, str] = {}
        for t in cat["targets"]:
            self.key_to_id[t["id"]] = t["id"]
            self.key_to_id[norm_key(t["name"])] = t["id"]
            for a in t["aliases"]:
                self.key_to_id[norm_key(a)] = t["id"]
        self.conj_by_key = {(c["target_id"], norm_key(c["clone"]), c["metal"], c["application"]): c for c in cat["conjugates"]}
        self.metals_by_clone: dict[tuple, list] = defaultdict(list)
        self.metals_by_target: dict[tuple, list] = defaultdict(list)
        for c in cat["conjugates"]:
            self.metals_by_clone[(c["target_id"], norm_key(c["clone"]), c["application"])].append(c["metal"])
            self.metals_by_target[(c["target_id"], c["application"])].append(c["metal"])

    def resolve(self, name: str) -> str | None:
        return self.key_to_id.get(norm_key(name))


def parse_list(v) -> list:
    """pdv2 stores lists as JSON strings with mixed int/str: '[\"5\",\"6\"]' or '[1,2]'."""
    if isinstance(v, list):
        raw = v
    else:
        try:
            raw = json.loads(v)
        except (TypeError, ValueError):
            return []
    return [int(x) for x in raw if x is not None and str(x).strip() != ""]


def slugify(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s


def kit_display_name(raw: str) -> str:
    n = raw.replace("_", " ")
    n = re.sub(r"\s*\(kit\)\s*$", "", n)
    n = re.sub(r"\s+IMC Panel \d+ An[dt]ibodies$", "", n)
    n = re.sub(r"\s+CyTOF Panel$", "", n)
    n = re.sub(r"^(Hu|Hum)/Mouse\s+", "", n)
    n = re.sub(r"^Hu\s+", "", n)
    n = re.sub(r"^Maxpar\s+", "", n)
    n = n.replace("Mye B Cell", "Myeloid/B Cell").replace("IMC Panel", "").replace("IMC Bundle", "Bundle")
    return re.sub(r"\s+", " ", n).strip()


def load_kits(cat_idx: CatalogIndex) -> tuple[list[dict], list[str]]:
    overrides = yaml.safe_load((CURATED / "modules" / "kit-overrides.yaml").read_text(encoding="utf8")).get("kits", {})
    modules, unresolved = [], []
    seen_slugs: set[str] = set()
    for fname, application in (("api_kit_contents.json", "imaging"), ("api_kit_contents_susp.json", "suspension")):
        kits = json.loads((RAW_PDV2 / fname).read_text(encoding="utf8"))
        for raw_name, kit in kits.items():
            meta = kit["meta"]
            ov = overrides.get(raw_name, {})
            name = ov.get("name") or kit_display_name(raw_name)
            slug = ov.get("slug") or slugify(name)
            if slug in seen_slugs:
                slug = f"{slug}-{meta['kit_id']}"
            seen_slugs.add(slug)
            markers = []
            for n in kit["nodes"]:
                if not n.get("active", 1):
                    continue
                raw_target = clean(n["target"])
                kit_only = "(Kit Only)" in raw_target
                tname = re.sub(r"\s*\(Kit Only\)\s*", "", raw_target)
                kind = "segmentation" if NON_ANTIBODY.match(tname) else "antibody"
                tid = cat_idx.resolve(tname) if kind == "antibody" else None
                if kind == "antibody" and tid is None:
                    unresolved.append(f"{raw_name}: {tname}")
                metal = clean(n["label"])
                mass = int(re.match(r"\d+", metal).group()) if re.match(r"\d+", metal) else None
                clone = clean(n.get("clone"))
                if application == "suspension":
                    signal = float(n["abundance_factor"]) if n.get("abundance_factor") else None
                    tolerance = float(n["important"]) if n.get("important") else None
                    level = abundance_from_signal(signal)
                    st_source = "titrated" if signal else "default"
                else:
                    signal, tolerance = None, None
                    level = IMC_PILL.get(int(n.get("abundance_factor") or 66), "medium")
                    st_source = "kit_pill"
                conj = cat_idx.conj_by_key.get((tid, norm_key(clone), metal, application)) if tid else None
                markers.append({
                    "target_id": tid,
                    "target_name": cat_idx.targets[tid]["name"] if tid else tname,
                    "raw_target": raw_target, "kind": kind, "role": "required",
                    "clone": clone or None, "metal": metal or None, "mass": mass,
                    "signal": signal, "tolerance": tolerance, "st_source": st_source, "abundance_level": level,
                    "kit_only": kit_only, "custom": bool(n.get("custom")),
                    "in_catalogue": tid is not None,
                    "conjugate_id": conj["id"] if conj else None,
                    "catalogue_metals": sorted(set(cat_idx.metals_by_clone.get((tid, norm_key(clone), application), [])),
                                               key=lambda m: int(re.match(r"\d+", m).group())) if tid else [],
                })
            modules.append({
                "id": slug, "slug": slug, "name": name, "source": "sbt_kit",
                "kit": {"pdv2_kit_id": meta["kit_id"], "pdv2_experiment_id": meta["id"], "raw_name": raw_name,
                        "created": meta.get("created"), "owner_user_id": meta.get("user_id")},
                "application": application,
                "species": [PDV2_REACTIVITY.get(i, str(i)) for i in parse_list(meta.get("kit_reactivity") or meta.get("reactivity"))],
                "instruments": [PDV2_INSTRUMENT.get(i, str(i)) for i in parse_list(meta.get("kit_instrument_avail"))],
                "sample_types": ov.get("sample_types", ["ffpe"] if application == "imaging" else ["pbmc", "whole_blood"]),
                "category": ov.get("category", "uncategorised"),
                "blurb": ov.get("blurb", ""),
                "featured": ov.get("featured", False),
                "hidden": ov.get("hidden", False),
                "markers": markers,
            })
    return modules, unresolved


def load_curated(cat_idx: CatalogIndex) -> tuple[list[dict], list[str]]:
    modules, unresolved = [], []
    for path in sorted((CURATED / "modules").glob("*.yaml")):
        if path.name == "kit-overrides.yaml":
            continue
        doc = yaml.safe_load(path.read_text(encoding="utf8"))
        for m in doc.get("modules", []):
            markers = []
            for mk in m["markers"]:
                name = mk["target"] if isinstance(mk, dict) else str(mk)
                role = mk.get("role", "required") if isinstance(mk, dict) else "required"
                hint = mk.get("abundance") if isinstance(mk, dict) else None
                note = mk.get("note") if isinstance(mk, dict) else None
                tid = cat_idx.resolve(name)
                if tid is None:
                    unresolved.append(f"{m['id']}: {name}")
                app = m["application"]
                metals = []
                if tid:
                    apps = ["imaging", "suspension"] if app == "both" else [app]
                    metals = sorted({x for a in apps for x in cat_idx.metals_by_target.get((tid, a), [])},
                                    key=lambda x: int(re.match(r"\d+", x).group()))
                markers.append({
                    "target_id": tid, "target_name": cat_idx.targets[tid]["name"] if tid else name, "raw_target": name,
                    "kind": "antibody", "role": role, "clone": None, "metal": None, "mass": None,
                    "signal": None, "tolerance": None, "st_source": "curated" if hint else "default",
                    "abundance_level": hint, "kit_only": False, "custom": False, "in_catalogue": tid is not None,
                    "conjugate_id": None,
                    "catalogue_metals": metals, "note": note,
                })
            modules.append({
                "id": m["id"], "slug": m["id"], "name": m["name"], "source": "curated", "kit": None,
                "application": m["application"], "species": m["species"], "instruments": [],
                "sample_types": m.get("sample_types", []), "category": m.get("category", "uncategorised"),
                "blurb": m.get("blurb", ""), "featured": m.get("featured", False), "hidden": False,
                "markers": markers,
            })
    return modules, unresolved


def build() -> dict:
    cat = json.loads((BUILD / "catalog.json").read_text(encoding="utf8"))
    idx = CatalogIndex(cat)
    kits, unresolved_k = load_kits(idx)
    curated, unresolved_c = load_curated(idx)
    modules = kits + curated
    stats = {
        "modules": len(modules), "sbt_kits": len(kits), "curated": len(curated),
        "kit_rows": sum(len(m["markers"]) for m in kits),
        "kit_rows_resolved": sum(1 for m in kits for mk in m["markers"] if mk["target_id"]),
        "kit_rows_with_catalogue_conjugate": sum(1 for m in kits for mk in m["markers"] if mk["conjugate_id"]),
        "kit_rows_target_in_catalogue_other_metal": sum(1 for m in kits for mk in m["markers"]
                                                        if mk["target_id"] and not mk["conjugate_id"] and mk["catalogue_metals"]),
        "unresolved_kit_targets": unresolved_k,
        "unresolved_curated_targets": unresolved_c,
    }
    return {"version": "2026-08-24.1", "stats": stats, "modules": modules}


def main() -> None:
    out = build()
    write_json(BUILD / "modules.json", out)
    for k, v in out["stats"].items():
        print(f"{k}: {v}")
