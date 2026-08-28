"""Build data/build/catalog.json from the store CSV + pdv2 harvest + curated aliases/species.

Entities (SPEC §4): Target -> Clone -> Conjugate (target, clone, metal, application) -> SKU (part number, format).
"""
from __future__ import annotations

import json
import logging
import re
from collections import defaultdict
from pathlib import Path

import pandas as pd
import yaml

from . import BUILD, CURATED, DATA, RAW_PDV2
from .names import CD_PART, clean, name_parts, norm_key, parse_mass, split_target
from .util import build_version, resolve_input, write_json

log = logging.getLogger(__name__)

# Dated inputs: newest match wins, overridable for a one-off rebuild against a different export.
STORE_CSV = resolve_input(DATA, "sbt-catalog-master-*.csv", "PD3_STORE_CSV")
HARVEST_CSV = resolve_input(RAW_PDV2, "pdv2-conjugate-signal-tolerance-*.csv", "PD3_HARVEST_CSV")
PDV2_PRODUCTS_CSV = resolve_input(RAW_PDV2, "pdv2-product-table-*.csv", "PD3_PDV2_PRODUCTS_CSV")
ALIASES_YAML = CURATED / "aliases.yaml"
SPECIES_YAML = CURATED / "species.yaml"

HREF = re.compile(r'href="([^"]+)"')
MAXPAR_PN = re.compile(r"^\d{7}[A-Z]$")

# Every value the store export is allowed to carry in these two columns. A label change must fail the build,
# not silently reclassify 372 IMC SKUs (audit #18).
APPLICATIONS = {"CyTOF (Cytometry)": "suspension", "IMC (Imaging)": "imaging"}
ASSAY_TYPES = {"Maxpar": "maxpar", "MaxparOnDemand": "ondemand"}


def classify(value, table: dict[str, str], column: str, part_number: str) -> str:
    v = clean(value)
    try:
        return table[v]
    except KeyError:
        raise ValueError(
            f"unknown {column} {v!r} on part number {part_number!r}; "
            f"known values: {sorted(table)}. Add it to catalog.{column.upper().replace(' ', '_')}S."
        ) from None


def parse_link(cell) -> tuple[str | None, str | None]:
    if not isinstance(cell, str):
        return None, None
    m = HREF.search(cell)
    return (m.group(1) if m else None), (clean(cell) or None)


def fix_metal(m: str) -> str:
    """'145ND' -> '145Nd', strips nbsp."""
    m = clean(m)
    return re.sub(r"^(\d+)([A-Za-z]+)$", lambda x: x.group(1) + x.group(2)[0].upper() + x.group(2)[1:].lower(), m)


def base_part(pn) -> str:
    pn = clean(pn)
    return pn[:-1] if MAXPAR_PN.match(pn) else pn


def parse_format(fmt: str) -> dict:
    f = clean(fmt)
    m = re.match(r"^(\d+)\s*Tests?$", f, re.I)
    if m:
        return {"raw": f, "unit": "tests", "qty": int(m.group(1))}
    m = re.match(r"^(\d+)\s*(?:µ|u)?g", f)
    if m:
        return {"raw": f, "unit": "ug", "qty": int(m.group(1))}
    m = re.match(r"^(\d+)\s*(?:µ|u)L", f)
    if m:
        return {"raw": f, "unit": "ul", "qty": int(m.group(1))}
    return {"raw": f, "unit": "other", "qty": None}


class SpeciesMap:
    def __init__(self):
        cfg = yaml.safe_load(SPECIES_YAML.read_text(encoding="utf8"))
        self.lookup = {v.lower(): code for code, vals in cfg["species"].items() for v in vals}
        self.pseudo = {k.lower(): v for k, v in cfg["pseudo"].items()}

    def parse(self, reactivity) -> tuple[list[str], list[str], list[str]]:
        """-> (codes, raw_terms, flags)."""
        raw = [clean(x) for x in clean(reactivity).split(",") if clean(x)]
        codes, flags = [], []
        for term in raw:
            t = term.lower()
            if t in self.pseudo:
                flags.append(self.pseudo[t])
                continue
            code = self.lookup.get(t)
            if code is None:
                code = "other"
                flags.append(f"unmapped:{term}")
            if code not in codes:
                codes.append(code)
        if "cross" in flags and not codes:
            codes = ["human", "mouse"]
            flags.append("low_confidence")
        return codes, raw, flags


class TargetRegistry:
    """Union-find over normalised name keys; every key maps to one target id."""

    def __init__(self):
        self.parent: dict[str, str] = {}
        self.names: dict[str, set[str]] = defaultdict(set)  # key -> raw spellings seen
        self.sources: dict[str, set[str]] = defaultdict(set)

    def add(self, name: str, source: str) -> str:
        k = norm_key(name)
        if not k:
            raise ValueError(f"empty key for {name!r}")
        self.parent.setdefault(k, k)
        self.names[k].add(clean(name))
        self.sources[k].add(source)
        return k

    def find(self, k: str) -> str:
        while self.parent[k] != k:
            self.parent[k] = self.parent[self.parent[k]]
            k = self.parent[k]
        return k

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[rb] = ra

    def resolve(self, name: str) -> str | None:
        k = norm_key(name)
        return self.find(k) if k in self.parent else None

    def members(self) -> dict[str, list[str]]:
        out = defaultdict(list)
        for k in self.parent:
            out[self.find(k)].append(k)
        return out


def apply_curated_aliases(reg: TargetRegistry) -> dict[str, str]:
    """Returns {normalised key of canonical: canonical display name}."""
    cfg = yaml.safe_load(ALIASES_YAML.read_text(encoding="utf8"))
    canon_names = {}
    for canon, others in cfg["aliases"].items():
        kc = reg.add(canon, "curated")
        canon_names[kc] = canon
        for o in others:
            reg.union(kc, reg.add(str(o), "curated"))
    return canon_names


def choose_display_name(spellings: set[str], preferred: set[str], curated: str | None) -> str:
    """Curated canonical wins; else a store spelling, most informative (CD number + name) first, then shortest."""
    if curated:
        return curated
    pool = [s for s in spellings if s in preferred] or list(spellings)
    return sorted(pool, key=lambda s: (-len(name_parts(s)), len(s), s))[0]


def build() -> dict:
    df = pd.read_csv(STORE_CSV, dtype=str)
    harvest = pd.read_csv(HARVEST_CSV, dtype=str)
    pdv2 = pd.read_csv(PDV2_PRODUCTS_CSV, dtype=str)
    species = SpeciesMap()
    reg = TargetRegistry()

    # ---- SKU rows -----------------------------------------------------------
    skus = []
    store_names: set[str] = set()
    for r in df.to_dict("records"):
        pn = clean(r["Part Number"])
        prefix_codes, target, kind = split_target(r["Target"])
        codes, raw_react, flags = species.parse(r["Reported Reactivity"])
        if prefix_codes and prefix_codes != ["cross"]:
            for c in reversed(prefix_codes):
                if c not in codes:
                    codes.insert(0, c)
        tds_url, tds_label = parse_link(r["Technical Data Sheet"])
        sds_url, sds_label = parse_link(r["Safety Data Sheet"])
        app = classify(r["Application"], APPLICATIONS, "Application", pn)
        assay = classify(r["Assay Type"], ASSAY_TYPES, "Assay Type", pn)
        sample_types = [s.strip().lower() for s in clean(r["Sample Type"]).split(",")
                        if s.strip() and s.strip().lower() != "various"]
        tkey = reg.add(target, "store")
        store_names.add(clean(target))
        for p in name_parts(target)[1:]:
            reg.union(tkey, reg.add(p, "store:cd" if CD_PART.match(p) else "store:part"))
        skus.append({
            "part_number": pn, "base_part": base_part(pn),
            "format_code": pn[-1] if MAXPAR_PN.match(pn) else None,
            "format": parse_format(r["Format"]),
            "raw_target": clean(r["Target"]), "target_name": target, "target_key": tkey, "kind": kind,
            "clone": clean(r["Clone"]), "metal": fix_metal(r["Metal"]),
            "application": app, "assay_type": assay,
            "reactivity": codes, "reactivity_raw": raw_react, "reactivity_flags": flags,
            "sample_types": sample_types,
            "tds_url": tds_url, "tds_label": tds_label, "sds_url": sds_url, "sds_label": sds_label,
        })

    # ---- pdv2 joins (harvest = S/T; product table = names) ------------------
    harvest["base"] = harvest["cat_number"].map(base_part)
    h_by_base = {b: g.iloc[0] for b, g in harvest.groupby("base")}
    pdv2["base"] = pdv2["cat_number"].map(base_part)
    p_by_base = {b: g.iloc[0] for b, g in pdv2.groupby("base")}
    joined_names = 0
    for s in skus:
        h = h_by_base.get(s["base_part"])
        p = p_by_base.get(s["base_part"])
        for src in (h, p):
            if src is not None and clean(src.get("target")):
                reg.union(s["target_key"], reg.add(src["target"], "pdv2"))
                joined_names += 1
        if h is not None:
            sig, tol = h.get("signal_di"), h.get("tolerance_di")
            has = not (pd.isna(sig) or pd.isna(tol))
            placeholder = has and float(sig) == 100 and float(tol) == 1
            s["pdv2"] = {
                "product_id": h.get("pdv2_product_id"),
                "signal": float(sig) if has and not placeholder else None,
                "tolerance": float(tol) if has and not placeholder else None,
                "cell": None if pd.isna(h.get("cell")) else h.get("cell"),
                "stim": None if pd.isna(h.get("stim")) or h.get("stim") == "None" else h.get("stim"),
                "st_source": "placeholder" if placeholder else ("titrated" if has else "none"),
                "release_date": h.get("release_date"),
                "custom_avail": h.get("custom_avail") == "1",
                "optimize_avail": h.get("optimize_avail") == "1",
            }
        else:
            s["pdv2"] = None

    canon_names = apply_curated_aliases(reg)

    # ---- targets ------------------------------------------------------------
    members = reg.members()
    root_of = {k: reg.find(k) for k in reg.parent}
    targets = {}
    for root, keys in members.items():
        spellings = set().union(*(reg.names[k] for k in keys))
        curated = next((canon_names[k] for k in keys if k in canon_names), None)
        display = choose_display_name(spellings, store_names, curated)
        targets[root] = {
            "id": root, "name": display,
            # Total order: case-insensitive, ties broken by the raw spelling so the bundle is byte-reproducible.
            "aliases": sorted(spellings - {display}, key=lambda s: (s.lower(), s)),
            "sources": sorted(set().union(*(reg.sources[k] for k in keys))),
        }
    for s in skus:
        s["target_id"] = root_of[s["target_key"]]
        del s["target_key"]

    # ---- conjugates (products) and clones -----------------------------------
    conj: dict[tuple, dict] = {}
    unparsed_metals: list[dict] = []
    for s in skus:
        mass = parse_mass(s["metal"])
        if mass is None:
            # No mass number in the metal label: the row cannot be placed on a channel. Record it, drop the conjugate.
            unparsed_metals.append({"part_number": s["part_number"], "target": s["raw_target"], "metal": s["metal"]})
            continue
        key = (s["target_id"], s["clone"], s["metal"], s["application"])
        c = conj.setdefault(key, {
            "id": f"{s['target_id']}|{s['clone']}|{s['metal']}|{s['application'][0]}",
            "target_id": s["target_id"], "target_name": targets[s["target_id"]]["name"], "clone": s["clone"],
            "metal": s["metal"], "mass": mass,
            "application": s["application"], "assay_type": s["assay_type"], "kind": s["kind"],
            "reactivity": [], "sample_types": [], "skus": [], "tds_url": s["tds_url"],
            "signal": None, "tolerance": None, "st_source": "default", "st_context": None,
            "status": "active",
        })
        for r in s["reactivity"]:
            if r not in c["reactivity"]:
                c["reactivity"].append(r)
        for st in s["sample_types"]:
            if st not in c["sample_types"]:
                c["sample_types"].append(st)
        c["skus"].append(s["part_number"])
        if s["pdv2"] and s["pdv2"]["signal"] is not None and c["signal"] is None:
            c["signal"], c["tolerance"] = s["pdv2"]["signal"], s["pdv2"]["tolerance"]
            c["st_source"] = "titrated"
            c["st_context"] = {"cell": s["pdv2"]["cell"], "stim": s["pdv2"]["stim"]}
    conjugates = list(conj.values())

    clones: dict[tuple, dict] = {}
    for c in conjugates:
        cl = clones.setdefault((c["target_id"], c["clone"]), {
            "target_id": c["target_id"], "clone": c["clone"], "reactivity": [], "applications": [], "n_conjugates": 0,
        })
        for r in c["reactivity"]:
            if r not in cl["reactivity"]:
                cl["reactivity"].append(r)
        if c["application"] not in cl["applications"]:
            cl["applications"].append(c["application"])
        cl["n_conjugates"] += 1

    for t in targets.values():
        t.update(n_conjugates=0, applications=[], kinds=[])
    for c in conjugates:
        t = targets[c["target_id"]]
        t["n_conjugates"] += 1
        if c["application"] not in t["applications"]:
            t["applications"].append(c["application"])
        if c["kind"] not in t["kinds"]:
            t["kinds"].append(c["kind"])
    targets_out = sorted((t for t in targets.values() if t["n_conjugates"] > 0), key=lambda t: t["name"].lower())
    alias_only = [t for t in targets.values() if t["n_conjugates"] == 0]

    stats = {
        "skus": len(skus), "conjugates": len(conjugates), "clones": len(clones), "targets": len(targets_out),
        "alias_only_targets": [t["name"] for t in alias_only],
        "conjugates_titrated": sum(c["st_source"] == "titrated" for c in conjugates),
        "conjugates_suspension": sum(c["application"] == "suspension" for c in conjugates),
        "conjugates_titrated_suspension": sum(c["st_source"] == "titrated" for c in conjugates if c["application"] == "suspension"),
        "skus_with_pdv2": sum(s["pdv2"] is not None for s in skus),
        "pdv2_name_joins": joined_names,
        "unmapped_species_terms": sorted({f[9:] for s in skus for f in s["reactivity_flags"] if f.startswith("unmapped:")}),
        "multi_metal_targets": sum(1 for t in targets_out if t["n_conjugates"] > 1),
        "unparsed_metals": unparsed_metals,
    }
    if unparsed_metals:
        log.warning("%d SKU(s) with an unparseable metal label dropped from conjugates", len(unparsed_metals))
    return {
        "version": build_version([STORE_CSV, HARVEST_CSV, PDV2_PRODUCTS_CSV, ALIASES_YAML, SPECIES_YAML]),
        "sources": {"store_csv": STORE_CSV.name, "pdv2_harvest": HARVEST_CSV.name, "pdv2_products": PDV2_PRODUCTS_CSV.name,
                    "aliases": ALIASES_YAML.name, "species": SPECIES_YAML.name},
        "stats": stats,
        "targets": targets_out,
        "clones": sorted(clones.values(), key=lambda c: (c["target_id"], c["clone"])),
        "conjugates": sorted(conjugates, key=lambda c: (c["target_name"].lower(), c["clone"], c["mass"])),
        "skus": skus,
    }


def main(out_path: Path | None = None) -> dict:
    out = build()
    path = out_path or (BUILD / "catalog.json")
    write_json(path, out)
    log.info("catalog %s -> %s", out["version"], path)
    print(json.dumps(out["stats"], indent=1, ensure_ascii=False))
    return out
