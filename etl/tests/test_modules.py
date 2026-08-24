import json

import pytest

from pd3_etl import BUILD


@pytest.fixture(scope="module")
def mods():
    return json.loads((BUILD / "modules.json").read_text(encoding="utf8"))


@pytest.fixture(scope="module")
def cat():
    return json.loads((BUILD / "catalog.json").read_text(encoding="utf8"))


def test_counts(mods):
    s = mods["stats"]
    assert s["sbt_kits"] == 62 and s["curated"] >= 14
    assert s["kit_rows"] == 640
    assert s["kit_rows_resolved"] >= 635
    assert s["kit_rows_with_catalogue_conjugate"] >= 600


def test_unique_ids(mods):
    ids = [m["id"] for m in mods["modules"]]
    assert len(ids) == len(set(ids))


def test_mdipa(mods):
    m = next(m for m in mods["modules"] if m["name"].startswith("Direct Immune Profiling Assay (MDIPA)"))
    assert m["application"] == "suspension" and len(m["markers"]) == 30
    assert all(mk["metal"] for mk in m["markers"])
    assert sum(mk["st_source"] == "titrated" for mk in m["markers"]) >= 25
    assert {mk["abundance_level"] for mk in m["markers"]} <= {"low", "medium", "high", "very_high"}


def test_imc_kits_use_pill_levels(mods):
    for m in mods["modules"]:
        if m["source"] == "sbt_kit" and m["application"] == "imaging":
            for mk in m["markers"]:
                assert mk["st_source"] == "kit_pill" and mk["signal"] is None
                assert mk["metal"] and mk["mass"]


def test_segmentation_kit_is_non_antibody(mods):
    seg = next(m for m in mods["modules"] if m["id"] == "cell-segmentation-kit")
    assert all(mk["kind"] == "segmentation" for mk in seg["markers"])
    assert {mk["mass"] for mk in seg["markers"]} == {195, 196, 198}


def test_conjugate_ids_exist(mods, cat):
    ids = {c["id"] for c in cat["conjugates"]}
    for m in mods["modules"]:
        for mk in m["markers"]:
            if mk["conjugate_id"]:
                assert mk["conjugate_id"] in ids


def test_curated_markers_mostly_resolve(mods):
    cur = [mk for m in mods["modules"] if m["source"] == "curated" for mk in m["markers"]]
    assert sum(mk["in_catalogue"] for mk in cur) / len(cur) > 0.9
    assert all(mk["abundance_level"] for mk in cur)


def test_featured_modules_have_blurbs(mods):
    for m in mods["modules"]:
        if m["featured"]:
            assert m["blurb"], m["id"]
