import json
import math
from pathlib import Path


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
