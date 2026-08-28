"""Build data/build/publications.json: papers per catalogue target, from a local literature database.

Source: an OpenAlex-derived SQLite file (``biblionautica.sqlite``: works / venues / work_techniques) that holds
titles + abstracts of mass-cytometry and multiplexed-imaging papers. Path from ``PD3_PUBS_DB`` or the default below.

Matching is abstract-level only (no full text), so it answers "which papers *mention* this marker in a CyTOF / IMC
context", not "which papers used this clone". Good enough for a "12 papers" badge and a reading list; clone-level
evidence needs full text or an SBT citation database (ROADMAP §1).

Output shape::

    {"version", "source": {...}, "stats": {...},
     "targets": {target_id: {"n": int, "by_technique": {"cytof": n, "imc": n}, "works": [
         {"id", "doi", "title", "year", "venue", "cited", "techniques": [...]}, ...]}}}
"""
from __future__ import annotations

import contextlib
import json
import logging
import os
import re
import sqlite3
from collections import Counter
from pathlib import Path

from . import BUILD, DATA
from .util import write_json

log = logging.getLogger(__name__)

# Default: a copy dropped next to the other inputs. Point PD3_PUBS_DB at one elsewhere (see README).
DEFAULT_DB = Path(os.environ.get("PD3_PUBS_DB") or DATA / "biblionautica.sqlite")
TECHNIQUES = ("cytof", "imc")  # antibody-metal techniques only; mihc/codex/mibi validate other conjugates
MAX_WORKS = 12
# Alias fragments that are real English words / too generic to match on their own.
STOP = {"fas", "kit", "cd", "ki", "beta", "alpha", "gamma", "delta", "human", "mouse", "rat", "anti", "pan", "type", "class",
        "light", "heavy", "chain", "actin", "total", "phospho", "cleaved", "active", "protein", "receptor", "ligand", "factor"}


def search_terms(name: str, aliases: list[str]) -> list[str]:
    """Whole-word regex fragments for a target: name + aliases, split on '/', bracket qualifiers dropped."""
    out: list[str] = []
    for raw in [name, *aliases]:
        n = re.sub(r"\s*\[.*?\]", "", raw).strip()
        # 'CD16/32' is one name (numeric tail); 'CD279/PD-1' is two.
        parts = [n] if re.search(r"/\d+$", n) else [p.strip() for p in n.split("/")]
        for p in parts:
            if len(p) < 3 or p.lower() in STOP or not re.search(r"[A-Za-z]", p):
                continue
            frag = re.escape(p).replace(r"\-", r"[-\s]?").replace(r"\ ", r"[-\s]?")
            if frag not in out:
                out.append(frag)
    return out


def compile_terms(terms: list[str]) -> re.Pattern | None:
    if not terms:
        return None
    return re.compile(r"(?<![A-Za-z0-9])(?:" + "|".join(terms) + r")(?![A-Za-z0-9])", re.I)


def load_works(conn: sqlite3.Connection) -> list[dict]:
    marks = ",".join("?" * len(TECHNIQUES))
    rows = conn.execute(
        f"""SELECT w.id, w.doi, w.title, w.abstract, w.publication_year, w.cited_by_count, v.display_name,
                   group_concat(DISTINCT t.technique)
            FROM works w JOIN work_techniques t ON t.work_id = w.id LEFT JOIN venues v ON v.id = w.venue_id
            WHERE t.technique IN ({marks}) GROUP BY w.id""",
        TECHNIQUES,
    ).fetchall()
    works = []
    for wid, doi, title, abstract, year, cited, venue, techs in rows:
        works.append({
            "id": (wid or "").rsplit("/", 1)[-1], "doi": (doi or "").replace("https://doi.org/", "") or None,
            "title": title or "", "year": year, "cited": cited or 0, "venue": venue,
            "techniques": sorted(set((techs or "").split(","))) if techs else [],
            "text": f"{title or ''}\n{abstract or ''}",
        })
    return works


def build(conn: sqlite3.Connection, catalog: dict, source: str = "") -> dict:
    works = load_works(conn)
    targets: dict[str, dict] = {}
    for t in catalog["targets"]:
        if t.get("kinds") and "antibody" not in t["kinds"]:
            continue  # secondaries and other reagents
        rx = compile_terms(search_terms(t["name"], t.get("aliases", [])))
        if rx is None:
            continue
        hits = [w for w in works if rx.search(w["text"])]
        if not hits:
            continue
        hits.sort(key=lambda w: (-(w["cited"] or 0), -(w["year"] or 0), w["title"]))
        by_tech = Counter(tech for w in hits for tech in w["techniques"] if tech in TECHNIQUES)
        targets[t["id"]] = {
            "n": len(hits), "by_technique": dict(sorted(by_tech.items())),
            "works": [{k: w[k] for k in ("id", "doi", "title", "year", "venue", "cited", "techniques")} for w in hits[:MAX_WORKS]],
        }
    return {
        "version": "2026-08-25.1",
        "source": {"db": source, "techniques": list(TECHNIQUES), "works_scanned": len(works), "match": "title+abstract whole-word"},
        "stats": {"targets_with_papers": len(targets), "targets_total": len(catalog["targets"]),
                  "papers_matched": len({w["id"] for v in targets.values() for w in v["works"]})},
        "targets": targets,
    }


def main(out_path: Path | None = None) -> dict | None:
    if not DEFAULT_DB.exists():
        log.warning("publications: %s not found; set PD3_PUBS_DB. Leaving data/build/publications.json as is.", DEFAULT_DB)
        return None
    catalog = json.loads((BUILD / "catalog.json").read_text(encoding="utf8"))
    # `with sqlite3.connect(...)` is a transaction context, not a closing one: close the connection explicitly.
    with contextlib.closing(sqlite3.connect(f"file:{DEFAULT_DB.as_posix()}?mode=ro", uri=True)) as conn:
        out = build(conn, catalog, source=DEFAULT_DB.name)
    path = out_path or (BUILD / "publications.json")
    write_json(path, out)
    log.info("publications -> %s", path)
    print(json.dumps({**out["source"], **out["stats"]}, indent=1))
    return out
