"""Sanity checks on the instrument bundle against the physics in the 2014/2015 guides."""
import pytest

from pd3_etl.instruments import build


@pytest.fixture(scope="module")
def bundle():
    return build()


def test_all_seven_pdv2_instruments_present(bundle):
    assert sorted(i["pdv2_id"] for i in bundle["instruments"]) == [1, 2, 3, 4, 5, 6, 7]


def _diff_cells(a, b):
    return [(d, r) for d in set(a) | set(b) for r in set(a.get(d, {})) | set(b.get(d, {}))
            if a.get(d, {}).get(r) != b.get(d, {}).get(r)]


def test_helios_equals_xt_and_hyperions_share_matrix(bundle):
    po = bundle["po_matrices"]
    # Helios and XT differ in exactly two cells (163Dy->164 1.8 vs 4.0; 125Te->130 rounding); captured 2026-08-24.
    assert len(_diff_cells(po["1"]["pct"], po["4"]["pct"])) == 2
    assert po["5"]["pct"] == po["6"]["pct"] == po["7"]["pct"]


def test_oxide_rule_light_lanthanides(bundle):
    """La/Ce/Pr/Nd oxides (M+16) should be ~2-3%; Eu (<0.1%) essentially absent."""
    xt = bundle["po_matrices"]["4"]["pct"]
    assert 1.5 <= xt["141"]["157"] <= 4.0        # Pr -> 157
    assert 1.5 <= xt["139"].get("155", 0) <= 4.0  # La -> 155
    assert xt.get("151", {}).get("167", 0) < 0.5   # Eu -> 167


def test_abundance_sensitivity_neighbours(bundle):
    """M±1 crosstalk is a small fraction (<= ~5%) on current instruments."""
    xt = bundle["po_matrices"]["4"]["pct"]
    for donor, row in xt.items():
        d = int(donor)
        for nb in (d - 1, d + 1):
            assert row.get(str(nb), 0) <= 5.0, (donor, nb, row.get(str(nb)))


def test_sensitivity_curve_shape(bundle):
    for curve in bundle["sensitivity_curves"].values():
        assert curve["141"] == 0.3
        assert all(curve[str(m)] == 1.0 for m in range(159, 170))
        assert curve["209"] == 0.7


def test_channels_have_elements_and_classes(bundle):
    for inst in bundle["instruments"]:
        for ch in inst["channels"]:
            assert ch["element"] and ch["range_class"]
        masses = [c["mass"] for c in inst["channels"]]
        assert masses == sorted(masses)
        assert 191 in masses and 193 in masses  # Ir always present


def test_cadmium_is_an_opt_in_on_imaging(bundle):
    """Cd is a catalogue metal on CyTOF. On IMC it is detectable but off SBT's conjugation list: usable only through the
    `advanced` opt-in (antibody=False, assumed sensitivity from instruments.yaml), never an antibody channel by default."""
    advanced = {m for g in bundle["advanced"]["imaging"] for m in g["masses"]}
    assert advanced, "instruments.yaml should offer Cd as an opt-in for imaging"
    for inst in bundle["instruments"]:
        cd = [c for c in inst["channels"] if c["element"] == "Cd"]
        if inst["modality"] == "imaging":
            assert all(not c["antibody"] for c in cd)
            assert {c["mass"] for c in cd if c["usable"]} == advanced
            assert all(c["rel_sensitivity"] == 0.3 for c in cd if c["usable"])
        else:
            assert any(c["usable"] and c["antibody"] for c in cd)


def test_usable_channel_counts(bundle):
    counts = {i["id"]: sum(c["usable"] for c in i["channels"]) for i in bundle["instruments"]}
    # 89, 115, 141-176, 193-198, 209 per the IMC curve (no 191, 113) = 45, plus the 7 opt-in Cd channels.
    assert counts["hyperion_xti"] == 45 + len(bundle["advanced"]["imaging"][0]["masses"])
    assert counts["cytof_xt"] >= 60
