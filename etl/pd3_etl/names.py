"""Target-name normalisation shared by catalogue, kits and modules."""
from __future__ import annotations

import re

GREEK = str.maketrans({"α": "a", "β": "b", "γ": "g", "δ": "d", "ε": "e", "κ": "k", "λ": "l", "μ": "u", "ζ": "z", "η": "h"})
NBSP = "\xa0"


def clean(s) -> str:
    if s is None or isinstance(s, float):
        return ""
    s = re.sub(r"<[^>]+>", "", str(s))
    return re.sub(r"\s+", " ", s.replace(NBSP, " ")).strip()


def norm_key(name: str) -> str:
    """Case/punctuation/Greek-insensitive key. 'CD3ε' -> 'cd3e', 'Pan-CytoKeratin' -> 'pancytokeratin'."""
    s = clean(name).lower().translate(GREEK)
    s = s.replace("phospho-", "p").replace("phospho ", "p")
    return re.sub(r"[^a-z0-9]", "", s)


SPECIES_PREFIX = re.compile(r"^Anti[- ]?(Human/Mouse|Mouse/Human|Human|Mouse|Rat|Cross)\s+(.+)$", re.I)
ANTI = re.compile(r"^Anti[- ]?(.+)$", re.I)
INNER_PREFIX = re.compile(r"^(Human/Mouse|Mouse/Human|Cross)\s+(.+)$", re.I)
SECONDARY = re.compile(r"^(Goat Anti-\w+ IgG|Biotin|FITC|PE)$", re.I)


def split_target(raw: str) -> tuple[list[str], str, str]:
    """'Anti-Human CD45' -> (['human'], 'CD45', 'antibody'). Returns (species_prefix_codes, target, kind)."""
    t = clean(raw)
    if t.startswith("Goat Anti-"):
        return [], t, "secondary"
    m = SPECIES_PREFIX.match(t)
    if m:
        prefix, rest = m.group(1), m.group(2)
    else:
        prefix = None
        m_anti = ANTI.match(t)
        rest = m_anti.group(1) if m_anti else t
    m2 = INNER_PREFIX.match(rest)
    if m2 and prefix is None:
        prefix, rest = m2.group(1), m2.group(2)
    codes: list[str] = []
    if prefix:
        p = prefix.lower()
        codes = ["cross"] if p == "cross" else p.split("/")
    rest = clean(rest)
    kind = "secondary" if SECONDARY.match(rest) else "antibody"
    return codes, rest, kind


CD_PART = re.compile(r"^CD\d+[a-z]?$", re.I)


def name_parts(name: str) -> list[str]:
    """'CD274/PD-L1' -> ['CD274/PD-L1', 'CD274', 'PD-L1']; bracketed phospho sites are never split."""
    base = re.sub(r"\s*\[.*?\]\s*", " ", name).strip()
    if "/" not in base:
        return [name]
    parts = [p.strip() for p in base.split("/")]
    # 'CD16/32', 'CD51/61', 'CD66a/c/e' are single antigen names (shared-number shorthand): never split those.
    if any(p.isdigit() or len(p) <= 1 for p in parts[1:]):
        return [name]
    if CD_PART.match(parts[0]) or all(len(p) > 2 for p in parts):
        return [name] + parts
    return [name]


MASS = re.compile(r"^\d+")


def parse_mass(metal) -> int | None:
    """'145Nd' -> 145. Returns None when the label carries no leading mass number."""
    m = MASS.match(clean(metal))
    return int(m.group()) if m else None


def mass_sort_key(metal) -> tuple:
    """Total order over metal labels that never raises on an unparseable one."""
    mass = parse_mass(metal)
    return (mass is None, mass or 0, clean(metal))
