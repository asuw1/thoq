"""Shared helpers for the data audit scripts: the Riyadh area, name normalisation, distance."""

from __future__ import annotations

import csv
import math
import re
import unicodedata
from pathlib import Path

OUT_DIR = Path(__file__).parent / "out"

# Greater Riyadh, generous enough to include Diriyah and the northern districts.
RIYADH_BBOX = {"south": 24.45, "north": 25.05, "west": 46.45, "east": 47.05}

_ARABIC_DIACRITICS = re.compile(r"[ً-ْٰـ]")  # harakat, dagger alef, tatweel
_ARABIC_FOLD = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي"})
_NOISE_RAW = {"cafe", "coffee", "the", "and", "restaurant", "co", "roasters", "مقهى", "كافيه", "قهوة", "مطعم"}


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return _ARABIC_DIACRITICS.sub("", s).translate(_ARABIC_FOLD).lower()


_NOISE_WORDS = {_fold(w) for w in _NOISE_RAW}


def normalize_name(name: str) -> str:
    """Lowercase, strip Latin accents and Arabic diacritics, fold Arabic letter variants,
    drop punctuation and generic words like "cafe" so "Nabta Café" matches "NABTA"."""
    if not name:
        return ""
    s = _fold(name)
    s = re.sub(r"^ال(?=\S{3,})", "", s)  # leading Arabic definite article
    words = [w for w in re.split(r"[^\w]+", s) if w and w not in _NOISE_WORDS]
    return " ".join(words)


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = math.radians
    dlat, dlng = r(lat2 - lat1), r(lng2 - lng1)
    h = math.sin(dlat / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(dlng / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


def in_riyadh(lat: float, lng: float) -> bool:
    b = RIYADH_BBOX
    return b["south"] <= lat <= b["north"] and b["west"] <= lng <= b["east"]


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def read_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))
