"""Flatten pdv2 get_labels_by_target harvest into one per-conjugate table."""
import json, glob, os, re
import pandas as pd

src = r"C:\Users\thoma\AppData\Local\Temp\claude\pdv2\harvest"
dst = r"C:\Users\thoma\notes\personal\megalodon\working\panel-designer-spec\data\pdv2-api"
rows = []
errs = 0
for f in glob.glob(os.path.join(src, "*.json")):
    pt = os.path.basename(f).split("_", 1)[0]
    try:
        d = json.load(open(f, encoding="utf8"))
    except Exception:
        errs += 1
        continue
    if not isinstance(d, dict):
        continue
    for tag, v in d.items():
        p = v.get("product") or {}
        rows.append({
            "panel_type": pt, "tag": tag, "channel": v.get("channel"), "tag_active": v.get("active"),
            "tag_optimize_available": v.get("optimize_available"), "cat_code": v.get("cat_code"),
            "pdv2_product_id": p.get("_ID"), "cat_number": p.get("cat_number"), "product": p.get("product"),
            "target": p.get("target"), "clone": p.get("clone"), "species": p.get("species"),
            "test_species": p.get("test_species"), "category": p.get("category"), "reagent_class": p.get("reagent_class"),
            "size": p.get("size"), "signal_di": p.get("Signal_Di"), "tolerance_di": p.get("Tolerance_Di"),
            "signal_legacy": p.get("signal_"), "tolerance_legacy": p.get("Tolerance"), "abundance": p.get("abundance"),
            "cell": p.get("cell"), "stim": p.get("stim"), "custom_avail": p.get("custom_avail"),
            "optimize_avail": p.get("optimize_avail"), "release_date": p.get("release_date"), "active": p.get("active"),
            "price": p.get("price"), "pdf_url": p.get("pdf_url"), "notes": p.get("notes"),
        })
df = pd.DataFrame(rows).drop_duplicates(subset=["panel_type", "cat_number", "tag"])
df.to_csv(os.path.join(dst, "pdv2-conjugate-signal-tolerance-2026-08-24.csv"), index=False)
print("files:", len(glob.glob(os.path.join(src, "*.json"))), "unreadable:", errs, "errors:", len(glob.glob(os.path.join(src, "*.err"))))
print("rows:", len(df))
print(df.groupby("panel_type").agg(products=("cat_number", "nunique"), targets=("target", "nunique")))
s = df[df.panel_type == "Flow"]
print("Flow with real signal (not 100/1, not null):", ((s.signal_di.notna()) & ~((s.signal_di == 100) & (s.tolerance_di == 1))).sum(), "of", len(s))
print("signal_di quantiles (Flow):", s.signal_di.astype(float).quantile([.05, .25, .5, .75, .95]).round(0).to_dict())
print("cell types:", s.cell.value_counts().head(8).to_dict())
print("stim:", s.stim.value_counts().head(6).to_dict())
i = df[df.panel_type == "IMC"]
print("IMC placeholder share:", ((i.signal_di == 100) & (i.tolerance_di == 1)).mean().round(3))
