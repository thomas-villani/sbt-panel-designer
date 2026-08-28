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
import logging
import re
from collections import Counter, defaultdict
from pathlib import Path

import yaml

from . import BUILD, CURATED, RAW_PDV2
from .names import clean, mass_sort_key, norm_key, parse_mass
from .util import build_version, write_json

log = logging.getLogger(__name__)

KIT_OVERRIDES = CURATED / "modules" / "kit-overrides.yaml"
KIT_CAPTURES = {"api_kit_contents.json": "imaging", "api_kit_contents_susp.json": "suspension"}
STABLE_KIT_ID = re.compile(r"^kit-\d+(-[a-z0-9-]+)?$")

PDV2_REACTIVITY = {1: "human", 2: "mouse", 3: "rat", 4: "rabbit"}
PDV2_INSTRUMENT = {1: "helios", 2: "cytof1", 3: "cytof2", 4: "cytof_xt", 5: "hyperion", 6: "hyperion_plus", 7: "hyperion_xti"}
NON_ANTIBODY = re.compile(r"^ICSK-\d$", re.I)

# Titrated-signal quantile cut points (dual counts, PBMC). Derived from the suspension harvest: IQR 58-374, 95th pct 1303.
ABUNDANCE_CUTS = [(60, "low"), (150, "medium"), (400, "high")]  # else very_high
IMC_PILL = {33: "low", 66: "medium", 100: "high"}


def _num(v, context: str, field: str, issues: dict[str, list]) -> float | None:
    """float(v), or None when pdv2 leaves the cell empty (0 / '' / null). Unparseable values are recorded, not raised."""
    if v is None or v == "" or v == 0:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        issues["abundance"].append({"context": context, "field": field, "value": repr(v)})
        return None


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
        self.apps_by_target: dict[str, set] = defaultdict(set)
        for c in cat["conjugates"]:
            if c["kind"] == "antibody":
                self.apps_by_target[c["target_id"]].add(c["application"])
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


def parse_list(v, errors: list | None = None, context: str = "") -> list:
    """pdv2 stores lists as JSON strings with mixed int/str: '[\"5\",\"6\"]' or '[1,2]'.

    Anything that does not parse is recorded in ``errors`` (with row context) rather than silently becoming [].
    """
    def fail(why: str):
        if errors is not None:
            errors.append({"context": context, "value": repr(v), "error": why})
        return []

    if isinstance(v, list):
        raw = v
    elif v is None or (isinstance(v, str) and not v.strip()):
        return []
    else:
        try:
            raw = json.loads(v)
        except (TypeError, ValueError) as e:
            return fail(f"not JSON: {e}")
        if not isinstance(raw, list):
            return fail(f"not a list: {type(raw).__name__}")
    out = []
    for x in raw:
        if x is None or str(x).strip() == "":
            continue
        try:
            out.append(int(x))
        except (TypeError, ValueError):
            fail(f"non-integer element {x!r}")
    return out


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


def load_kits(cat_idx: CatalogIndex) -> tuple[list[dict], list[str], dict[str, list]]:
    overrides = yaml.safe_load(KIT_OVERRIDES.read_text(encoding="utf8")).get("kits", {})
    modules, unresolved = [], []
    issues: dict[str, list] = {"parse_list": [], "abundance": []}
    seen_slugs: set[str] = set()
    captured_names: set[str] = set()
    for fname, application in KIT_CAPTURES.items():
        kits = json.loads((RAW_PDV2 / fname).read_text(encoding="utf8"))
        captured_names |= set(kits)
        for raw_name, kit in kits.items():
            meta = kit["meta"]
            ov = overrides.get(raw_name, {})
            name = ov.get("name") or kit_display_name(raw_name)
            # `id` is the stable identity (ledger in kit-overrides.yaml; share links / saved panels key on it);
            # `slug` is display/routing only and may change with the name.
            kit_id = ov.get("id")
            if not kit_id or not STABLE_KIT_ID.match(str(kit_id)):
                raise ValueError(f"{KIT_OVERRIDES.name}: kit {raw_name!r} needs a stable `id` (kit-<pdv2 kit_id>[-suffix]), got {kit_id!r}")
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
                mass = parse_mass(metal)
                clone = clean(n.get("clone"))
                row_ctx = f"{raw_name}: {tname} ({metal})"
                if application == "suspension":
                    signal = _num(n.get("abundance_factor"), row_ctx, "abundance_factor", issues)
                    tolerance = _num(n.get("important"), row_ctx, "important", issues)
                    level = abundance_from_signal(signal)
                    st_source = "titrated" if signal else "default"
                else:
                    signal, tolerance = None, None
                    pill = _num(n.get("abundance_factor"), row_ctx, "abundance_factor", issues)
                    level = IMC_PILL.get(int(pill) if pill is not None else 66, "medium")
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
                                               key=mass_sort_key) if tid else [],
                    "applications": sorted(cat_idx.apps_by_target.get(tid, [])) if tid else [],
                })
            modules.append({
                "id": kit_id, "slug": slug, "name": name, "source": "sbt_kit",
                "kit": {"pdv2_kit_id": meta["kit_id"], "pdv2_experiment_id": meta["id"], "raw_name": raw_name,
                        "created": meta.get("created"), "owner_user_id": meta.get("user_id")},
                "application": application,
                "species": [PDV2_REACTIVITY.get(i, str(i)) for i in
                            parse_list(meta.get("kit_reactivity") or meta.get("reactivity"), issues["parse_list"],
                                       f"{raw_name}.kit_reactivity")],
                "instruments": [PDV2_INSTRUMENT.get(i, str(i)) for i in
                                parse_list(meta.get("kit_instrument_avail"), issues["parse_list"],
                                           f"{raw_name}.kit_instrument_avail")],
                "sample_types": ov.get("sample_types", ["ffpe"] if application == "imaging" else ["pbmc", "whole_blood"]),
                "category": ov.get("category", "uncategorised"),
                "blurb": ov.get("blurb", ""),
                "featured": ov.get("featured", False),
                "hidden": ov.get("hidden", False),
                "aliases": ov.get("aliases", []), "definition": None,
                "markers": markers,
            })
    # kit-overrides.yaml is keyed by the raw pdv2 kit name: both sides must line up exactly, or display metadata
    # silently goes missing (unknown key) / a new kit ships as "uncategorised" (uncovered kit).
    unknown_keys = sorted(set(overrides) - captured_names)
    uncovered_kits = sorted(captured_names - set(overrides))
    if unknown_keys or uncovered_kits:
        raise ValueError(
            f"{KIT_OVERRIDES.name} does not match the captured kits.\n"
            f"  override keys with no kit ({len(unknown_keys)}): {unknown_keys}\n"
            f"  kits with no override ({len(uncovered_kits)}): {uncovered_kits}"
        )
    return modules, unresolved, issues


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
                negative = bool(mk.get("negative")) if isinstance(mk, dict) else False
                tid = cat_idx.resolve(name)
                if tid is None:
                    unresolved.append(f"{m['id']}: {name}")
                app = m["application"]
                metals = []
                if tid:
                    apps = ["imaging", "suspension"] if app == "both" else [app]
                    metals = sorted({x for a in apps for x in cat_idx.metals_by_target.get((tid, a), [])},
                                    key=mass_sort_key)
                markers.append({
                    "target_id": tid, "target_name": cat_idx.targets[tid]["name"] if tid else name, "raw_target": name,
                    "kind": "antibody", "role": role, "clone": None, "metal": None, "mass": None,
                    "signal": None, "tolerance": None, "st_source": "curated" if hint else "default",
                    "abundance_level": hint, "kit_only": False, "custom": False, "in_catalogue": tid is not None,
                    "conjugate_id": None,
                    "catalogue_metals": metals, "note": note, "polarity": "neg" if negative else "pos",
                    "applications": sorted(cat_idx.apps_by_target.get(tid, [])) if tid else [],
                })
            modules.append({
                "id": m["id"], "slug": m["id"], "name": m["name"], "source": "curated", "kit": None,
                "application": m["application"], "species": m["species"], "instruments": [],
                "sample_types": m.get("sample_types", []), "category": m.get("category", "uncategorised"),
                "blurb": m.get("blurb", ""), "featured": m.get("featured", False), "hidden": False,
                "aliases": m.get("aliases", []), "definition": m.get("definition"),
                "markers": markers,
            })
    return modules, unresolved


def curated_yamls() -> list[Path]:
    return sorted((CURATED / "modules").glob("*.yaml"))


def build(cat: dict | None = None) -> dict:
    cat = cat if cat is not None else json.loads((BUILD / "catalog.json").read_text(encoding="utf8"))
    idx = CatalogIndex(cat)
    kits, unresolved_k, issues = load_kits(idx)
    curated, unresolved_c = load_curated(idx)
    modules = kits + curated
    dupe_ids = sorted(i for i, n in Counter(m["id"] for m in modules).items() if n > 1)
    if dupe_ids:
        raise ValueError(f"duplicate module ids across kits and curated YAML: {dupe_ids}")
    stats = {
        "modules": len(modules), "sbt_kits": len(kits), "curated": len(curated),
        "kit_rows": sum(len(m["markers"]) for m in kits),
        "kit_rows_resolved": sum(1 for m in kits for mk in m["markers"] if mk["target_id"]),
        "kit_rows_with_catalogue_conjugate": sum(1 for m in kits for mk in m["markers"] if mk["conjugate_id"]),
        "kit_rows_target_in_catalogue_other_metal": sum(1 for m in kits for mk in m["markers"]
                                                        if mk["target_id"] and not mk["conjugate_id"] and mk["catalogue_metals"]),
        "unresolved_kit_targets": unresolved_k,
        "unresolved_curated_targets": unresolved_c,
        "unparsed_kit_values": issues["abundance"] + issues["parse_list"],
    }
    for issue in stats["unparsed_kit_values"]:
        log.warning("unparseable kit value: %s", issue)
    version = build_version([*curated_yamls(), *(RAW_PDV2 / f for f in KIT_CAPTURES)], extra=cat["version"])
    return {"version": version, "stats": stats, "modules": modules}


def main(out_path: Path | None = None, cat: dict | None = None) -> dict:
    out = build(cat)
    path = out_path or (BUILD / "modules.json")
    write_json(path, out)
    log.info("modules %s -> %s", out["version"], path)
    print(json.dumps(out["stats"], indent=1, ensure_ascii=False))
    return out
