"""Sanity checks on the instrument bundle against the physics in the 2014/2015 guides."""
import pytest

from pd3_etl.instruments import build


@pytest.fixture(scope="module")
def bundle():
    return build()


def test_all_seven_pdv2_instruments_present(bundle):
    assert sorted(i["pdv2_id"] for i in bundle["instruments"]) == [1, 2, 3, 4, 5, 6, 7]


def test_helios_equals_xt_and_hyperions_share_matrix(bundle):
    po = bundle["po_matrices"]
    assert po["1"]["pct"] == po["4"]["pct"]
    assert po["5"]["pct"] == po["6"]["pct"] == po["7"]["pct"]


def test_oxide_rule_light_lanthanides(bundle):
    """La/Ce/Pr/Nd oxides (M+16) should be ~2-3%; Eu (<0.1%) essentially absent."""
    xt = bundle["po_matrices"]["4"]["pct"]
    assert 1.5 <= xt["141"]["157"] <= 4.0        # Pr -> 157
    assert 1.5 <= xt["139"].get("155", 0) <= 4.0  # La -> 155
    assert xt.get("151", {}).get("167", 0) < 0.5   # Eu -> 167


def test_abundance_sensitivity_neighbours(bundle):
    """M±1 crosstalk is a small fraction (<= ~2%) on current instruments."""
    xt = bundle["po_matrices"]["4"]["pct"]
    for donor, row in xt.items():
        d = int(donor)
        for nb in (d - 1, d + 1):
            assert row.get(str(nb), 0) <= 2.0, (donor, nb, row.get(str(nb)))


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


def test_imaging_instruments_have_no_cadmium(bundle):
    for inst in bundle["instruments"]:
        elements = {c["element"] for c in inst["channels"]}
        if inst["modality"] == "imaging":
            assert "Cd" not in elements
        else:
            assert "Cd" in elements
