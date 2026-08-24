import json
from pathlib import Path


def read_pdv2_capture(path: Path):
    """pdv2 captures are '<status> <json body>' on one line."""
    text = path.read_text(encoding="utf8").strip()
    status, _, body = text.partition(" ")
    if status != "200":
        raise ValueError(f"{path.name}: HTTP {status}")
    return json.loads(body)


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=1, ensure_ascii=False, sort_keys=False) + "\n", encoding="utf8")
