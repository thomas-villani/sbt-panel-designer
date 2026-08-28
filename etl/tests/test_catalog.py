import pytest

from pd3_etl.catalog import APPLICATIONS, ASSAY_TYPES, classify
from pd3_etl.names import name_parts, norm_key, parse_mass, split_target

# `cat` is a session fixture in conftest.py: catalog.build() run into a tmp path, not the committed artefact.


def by_name(cat, name):
    k = norm_key(name)
    for t in cat["targets"]:
        if t["id"] == k or norm_key(t["name"]) == k or any(norm_key(a) == k for a in t["aliases"]):
            return t
    return None


def test_split_target():
    assert split_target("Anti-Human CD45") == (["human"], "CD45", "antibody")
    assert split_target("Anti-CD45") == ([], "CD45", "antibody")
    assert split_target("Anti-Human/Mouse Ki-67") == (["human", "mouse"], "Ki-67", "antibody")
    assert split_target("Anti-Mouse/Human CD44") == (["mouse", "human"], "CD44", "antibody")
    assert split_target("Anti-Cross Arginase-1") == (["cross"], "Arginase-1", "antibody")
    assert split_target("Anti pStat5 [pY694]") == ([], "pStat5 [pY694]", "antibody")
    assert split_target("Goat Anti-Mouse IgG")[2] == "secondary"
    assert split_target("Anti-Biotin ")[2] == "secondary"


def test_name_parts():
    assert name_parts("CD274/PD-L1") == ["CD274/PD-L1", "CD274", "PD-L1"]
    assert name_parts("CD16/32") == ["CD16/32"]
    assert name_parts("CD66a/c/e") == ["CD66a/c/e"]
    assert name_parts("pERK1/2 [T202/Y204]") == ["pERK1/2 [T202/Y204]"]


def test_norm_key_folds_greek_and_case():
    assert norm_key("CD3ε") == norm_key("CD3e") == norm_key("CD3 epsilon")[:4]
    assert norm_key("Pan-CytoKeratin") == norm_key("pan-cytokeratin")


def test_every_sku_grouped(cat):
    assert cat["stats"]["skus"] == 1822
    assert len({s["part_number"] for s in cat["skus"]}) == 1822
    conj_skus = sum(len(c["skus"]) for c in cat["conjugates"])
    assert conj_skus == 1822


def test_key_targets_resolve(cat):
    assert by_name(cat, "PD-L1")["name"] == "CD274/PD-L1"
    assert by_name(cat, "CD3")["name"] == "CD3ε"
    assert by_name(cat, "aSMA")["name"] == "α-Smooth Muscle Actin"
    assert by_name(cat, "CD16")["name"] == "CD16"
    assert by_name(cat, "CD16/32")["name"] == "CD16/32"
    assert by_name(cat, "HLA-DR")["name"] == "HLA-DR"
    assert by_name(cat, "MHC Class II") is not by_name(cat, "HLA-DR")


def test_cd45_has_many_metals(cat):
    cd45 = by_name(cat, "CD45")
    assert cd45["n_conjugates"] >= 15


def test_titrated_only_on_suspension(cat):
    for c in cat["conjugates"]:
        if c["st_source"] == "titrated":
            assert c["application"] == "suspension"
            assert c["signal"] > 0 and c["tolerance"] > 0
    assert cat["stats"]["conjugates_titrated_suspension"] > 500


def test_secondaries_flagged(cat):
    kinds = {t["name"]: t["kinds"] for t in cat["targets"]}
    assert kinds["Biotin"] == ["secondary"]
    assert kinds["Goat Anti-Mouse IgG"] == ["secondary"]


def test_metal_spelling_normalised(cat):
    metals = {c["metal"] for c in cat["conjugates"]}
    assert "145ND" not in metals and "145Nd" in metals
    assert all(m == m.strip() for m in metals)


def test_no_unmapped_species(cat):
    assert cat["stats"]["unmapped_species_terms"] == []


def test_application_and_assay_are_an_allow_list():
    assert classify("CyTOF (Cytometry)", APPLICATIONS, "Application", "3145001B") == "suspension"
    assert classify("IMC (Imaging)", APPLICATIONS, "Application", "3145001B") == "imaging"
    assert classify("Maxpar", ASSAY_TYPES, "Assay Type", "3145001B") == "maxpar"
    assert classify("MaxparOnDemand", ASSAY_TYPES, "Assay Type", "3145001B") == "ondemand"


def test_unknown_application_raises_naming_value_and_part():
    with pytest.raises(ValueError) as e:
        classify("IMC (Imaging v2)", APPLICATIONS, "Application", "3145001B")
    assert "IMC (Imaging v2)" in str(e.value) and "3145001B" in str(e.value)
    with pytest.raises(ValueError) as e:
        classify("MaxparOnDemand Plus", ASSAY_TYPES, "Assay Type", "3111001C")
    assert "MaxparOnDemand Plus" in str(e.value) and "3111001C" in str(e.value)


def test_every_sku_carries_a_classified_application(cat):
    assert {s["application"] for s in cat["skus"]} == {"suspension", "imaging"}
    assert {s["assay_type"] for s in cat["skus"]} == {"maxpar", "ondemand"}
    assert sum(s["application"] == "imaging" for s in cat["skus"]) == 372


def test_alias_order_is_a_total_order(cat):
    """Case-only ties (FOXP3 / Foxp3) must sort reproducibly, not by set iteration order."""
    for t in cat["targets"]:
        assert t["aliases"] == sorted(t["aliases"], key=lambda s: (s.lower(), s)), t["id"]
    foxp3 = by_name(cat, "FoxP3")
    assert foxp3["aliases"] == ["FOXP3", "Foxp3"]


def test_metal_labels_all_parse_to_a_mass(cat):
    assert cat["stats"]["unparsed_metals"] == []
    assert all(c["mass"] == parse_mass(c["metal"]) for c in cat["conjugates"])


def test_version_is_dated_content_hash(cat):
    date, _, digest = cat["version"].partition(".")
    assert len(date.split("-")) == 3 and len(digest) == 8
    assert cat["sources"]["store_csv"].startswith("sbt-catalog-master-")
