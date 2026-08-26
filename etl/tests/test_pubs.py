import json
import sqlite3

import pytest

from pd3_etl import BUILD
from pd3_etl.pubs import build, compile_terms, search_terms


def test_search_terms_split_and_stoplist():
    assert search_terms("CD279/PD-1", ["PD1", "PDCD1"]) == ["CD279", r"PD[-\s]?1", "PD1", "PDCD1"]
    assert search_terms("CD16/32", []) == ["CD16/32"]  # numeric tail: one name
    assert "Fas" not in "".join(search_terms("CD95/Fas", ["Fas"]))
    assert search_terms("pStat3 [Y705]", []) == ["pStat3"]


def test_compile_terms_whole_word():
    rx = compile_terms(search_terms("CD8a", ["CD8"]))
    assert rx.search("CD8+ T cells") and rx.search("cd8a expression")
    assert not rx.search("CD80 and CD86")


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    c.executescript("""
      CREATE TABLE works (id TEXT PRIMARY KEY, doi TEXT, title TEXT, abstract TEXT, publication_year INTEGER, cited_by_count INTEGER, venue_id TEXT);
      CREATE TABLE venues (id TEXT PRIMARY KEY, display_name TEXT);
      CREATE TABLE work_techniques (work_id TEXT, technique TEXT, PRIMARY KEY (work_id, technique));
      INSERT INTO venues VALUES ('V1', 'Nature Methods');
      INSERT INTO works VALUES ('https://openalex.org/W1', 'https://doi.org/10.1/a', 'IMC of CD8 T cells', 'PD-1 on CD8+ cells', 2024, 50, 'V1');
      INSERT INTO works VALUES ('https://openalex.org/W2', NULL, 'Spectral flow paper', 'CD8 everywhere', 2023, 500, NULL);
      INSERT INTO works VALUES ('https://openalex.org/W3', 'https://doi.org/10.1/c', 'CyTOF of monocytes', 'CD14 and CD16', 2022, 5, 'V1');
      INSERT INTO work_techniques VALUES ('https://openalex.org/W1', 'imc');
      INSERT INTO work_techniques VALUES ('https://openalex.org/W1', 'cytof');
      INSERT INTO work_techniques VALUES ('https://openalex.org/W2', 'spectral_flow');
      INSERT INTO work_techniques VALUES ('https://openalex.org/W3', 'cytof');
    """)
    return c


def test_build_matches_only_cytof_imc(conn):
    cat = {"targets": [
        {"id": "cd8", "name": "CD8a", "aliases": ["CD8"], "kinds": ["antibody"]},
        {"id": "cd279pd1", "name": "CD279/PD-1", "aliases": [], "kinds": ["antibody"]},
        {"id": "cd14", "name": "CD14", "aliases": [], "kinds": ["antibody"]},
        {"id": "gam", "name": "Goat Anti-Mouse IgG", "aliases": [], "kinds": ["secondary"]},
        {"id": "cd4", "name": "CD4", "aliases": [], "kinds": ["antibody"]},
    ]}
    out = build(conn, cat, source="test.sqlite")
    assert out["source"]["works_scanned"] == 2
    t = out["targets"]
    assert set(t) == {"cd8", "cd279pd1", "cd14"}
    assert t["cd8"]["n"] == 1 and t["cd8"]["works"][0] == {
        "id": "W1", "doi": "10.1/a", "title": "IMC of CD8 T cells", "year": 2024, "venue": "Nature Methods", "cited": 50, "techniques": ["cytof", "imc"]}
    assert t["cd8"]["by_technique"] == {"cytof": 1, "imc": 1}
    assert t["cd14"]["works"][0]["doi"] == "10.1/c"
    assert out["stats"] == {"targets_with_papers": 3, "targets_total": 5, "papers_matched": 2}


def test_build_file_if_present():
    p = BUILD / "publications.json"
    if not p.exists():
        pytest.skip("publications.json not built (needs the local literature DB)")
    d = json.loads(p.read_text(encoding="utf8"))
    assert d["stats"]["targets_with_papers"] >= 250
    assert d["targets"]["cd8"]["n"] >= 500
    for v in d["targets"].values():
        assert 1 <= len(v["works"]) <= 12 and v["n"] >= len(v["works"])
