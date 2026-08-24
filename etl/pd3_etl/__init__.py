"""PD3 ETL package."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RAW_PDV2 = DATA / "pdv2-api"
CURATED = DATA / "curated"
BUILD = DATA / "build"
