import hashlib
import json
import math
import os
from datetime import date
from pathlib import Path
from typing import Iterable


def read_pdv2_capture(path: Path):
    """pdv2 captures are '<status> <json body>' on one line."""
    text = path.read_text(encoding="utf8").strip()
    status, _, body = text.partition(" ")
    if status != "200":
        raise ValueError(f"{path.name}: HTTP {status}")
    return json.loads(body)


def _clean(obj):
    """Replace float NaN/inf (pandas missing values) with None so the output is strict JSON."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    return obj


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(_clean(obj), indent=1, ensure_ascii=False, sort_keys=False, allow_nan=False) + "\n",
        encoding="utf8",
    )


def resolve_input(directory: Path, pattern: str, env_var: str) -> Path:
    """Resolve a dated input file: ``$env_var`` if set, else the newest ``pattern`` match in ``directory``.

    Inputs are date-stamped (``sbt-catalog-master-2026-07-29.csv``), so "newest" is the last name in sort order.
    """
    override = os.environ.get(env_var)
    if override:
        p = Path(override)
        if not p.is_absolute():
            p = directory / p
        if not p.exists():
            raise FileNotFoundError(f"{env_var}={override!r} does not exist (resolved to {p})")
        return p
    matches = sorted(directory.glob(pattern))
    if not matches:
        raise FileNotFoundError(f"no {pattern!r} in {directory}; set {env_var} to point at one")
    return matches[-1]


def content_hash(paths: Iterable[Path], extra: str = "") -> str:
    """First 8 hex of sha256 over the sorted input files' bytes (plus an optional upstream version string)."""
    h = hashlib.sha256()
    for p in sorted(set(paths), key=lambda p: p.as_posix()):
        h.update(p.read_bytes())
    if extra:
        h.update(extra.encode("utf8"))
    return h.hexdigest()[:8]


def build_version(paths: Iterable[Path], extra: str = "") -> str:
    """``YYYY-MM-DD.<8-hex content hash>``: today's build date plus a hash of the inputs."""
    return f"{date.today().isoformat()}.{content_hash(paths, extra)}"
