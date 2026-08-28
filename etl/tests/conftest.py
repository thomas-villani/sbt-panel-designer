"""Session fixtures: the bundles under test are *built* here, not read from the committed artefact.

`build()` runs once per session, is written to a tmp path through the real `write_json` (so JSON-encoding
problems such as NaN surface in the tests too) and read back.
"""
import json

import pytest

from pd3_etl import catalog, modules


@pytest.fixture(scope="session")
def build_dir(tmp_path_factory):
    return tmp_path_factory.mktemp("build")


@pytest.fixture(scope="session")
def cat(build_dir):
    path = build_dir / "catalog.json"
    catalog.main(out_path=path)
    return json.loads(path.read_text(encoding="utf8"))


@pytest.fixture(scope="session")
def mods(build_dir, cat):
    path = build_dir / "modules.json"
    modules.main(out_path=path, cat=cat)
    return json.loads(path.read_text(encoding="utf8"))
