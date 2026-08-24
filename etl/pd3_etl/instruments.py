"""Build data/build/instruments.json from pdv2 spillover/massbias captures + curated instrument YAML.

Output shape (consumed by engine/):
{
  "version": ..., "sources": {...},
  "isotopes": {"141": "Pr", ...},
  "po_matrices": {"4": {"donors": [89, ...], "recipients": [89, ...],
                        "pct": {"141": {"140": 0.3, "142": 0.3, "157": 3.0}}}},   # off-diagonal only, percent
  "sensitivity_curves": {"0": {"89": 0.3, ...}, "1": {...}},
  "instruments": [{"id": "cytof_xt", ..., "channels": [{"mass": 141, "element": "Pr", "label": "141Pr",
                   "rel_sensitivity": 0.3, "range_class": "bright_only"}]}],
  "reserved": {...}, "range_classes": [...]
}
"""
from __future__ import annotations

import yaml

from . import BUILD, CURATED, RAW_PDV2
from .util import read_pdv2_capture, write_json


def load_po_matrix(pdv2_id: int) -> dict:
    raw = read_pdv2_capture(RAW_PDV2 / f"api_spillover_{pdv2_id}.txt")
    donors = sorted(int(k) for k in raw)
    recip_keys = sorted(int(k) for k in next(iter(raw.values())) if k.isdigit())
    pct: dict[str, dict[str, float]] = {}
    anomalies: list[str] = []
    for donor, row in raw.items():
        assert row["tag_id"] == donor
        if row[donor] != "100":
            # pdv2 data-entry gap (128Te on Helios/XT has a null diagonal); treat as 100 and record it.
            anomalies.append(f"donor {donor}: diagonal {row[donor]!r} treated as 100")
        cells = {}
        for k, v in row.items():
            if not k.isdigit() or k == donor or v in (None, "0"):
                continue
            val = float(v)
            if val != 0.0:
                cells[k] = val
        if cells:
            pct[donor] = dict(sorted(cells.items(), key=lambda kv: int(kv[0])))
    return {"donors": donors, "recipients": recip_keys, "pct": pct, "anomalies": anomalies}


def load_sensitivity_curve(panel_type: int) -> dict[str, float]:
    raw = read_pdv2_capture(RAW_PDV2 / f"api_massbias_{panel_type}.txt")
    return {str(r["channel"]): float(r["bias"]) for r in sorted(raw, key=lambda r: r["channel"])}


def classify_mass(mass: int, range_classes: list[dict]) -> str:
    for rc in range_classes:
        if "masses_below" in rc and mass < rc["masses_below"]:
            return rc["id"]
        if "masses_above" in rc and mass > rc["masses_above"]:
            return rc["id"]
        if "masses" in rc and rc["masses"][0] <= mass <= rc["masses"][1]:
            return rc["id"]
    raise ValueError(f"mass {mass} matches no range class")


def build() -> dict:
    cfg = yaml.safe_load((CURATED / "instruments" / "instruments.yaml").read_text(encoding="utf8"))
    isotopes = {str(k): v for k, v in yaml.safe_load((CURATED / "instruments" / "isotopes.yaml").read_text()).items()}

    po_ids = sorted({i["po_matrix"] for i in cfg["instruments"]})
    po_matrices = {str(i): load_po_matrix(i) for i in po_ids}
    curve_ids = sorted({i["sensitivity_curve"] for i in cfg["instruments"]})
    curves = {str(i): load_sensitivity_curve(i) for i in curve_ids}

    instruments = []
    for inst in cfg["instruments"]:
        po = po_matrices[str(inst["po_matrix"])]
        curve = curves[str(inst["sensitivity_curve"])]
        reserved_masses = {m for role in cfg["reserved"][inst["modality"]] for m in role["masses"]}
        channels = []
        for mass in sorted(set(po["recipients"]) | reserved_masses):
            element = isotopes.get(str(mass))
            if element is None:
                raise KeyError(f"no element for mass {mass}; add it to isotopes.yaml")
            channels.append({
                "mass": mass,
                "element": element,
                "label": f"{mass}{element}",
                # The pdv2 sensitivity curve doubles as the "usable channel" list: the IMC curve omits Cd/Te/Xe.
                "rel_sensitivity": curve.get(str(mass)),
                "usable": str(mass) in curve,
                "in_po_matrix": mass in po["recipients"],
                "range_class": classify_mass(mass, cfg["range_classes"]),
            })
        instruments.append({**inst, "channels": channels})

    return {
        "version": str(cfg["version"]),
        "sources": cfg["sources"],
        "isotopes": isotopes,
        "po_matrices": po_matrices,
        "sensitivity_curves": curves,
        "instruments": instruments,
        "reserved": cfg["reserved"],
        "range_classes": cfg["range_classes"],
    }


def main() -> None:
    out = build()
    write_json(BUILD / "instruments.json", out)
    for inst in out["instruments"]:
        n_ch = len(inst["channels"])
        n_po = sum(len(v) for v in out["po_matrices"][str(inst["po_matrix"])]["pct"].values())
        print(f"{inst['id']:14s} {inst['name']:13s} {n_ch} channels, {n_po} non-zero PO cells")
