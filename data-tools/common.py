"""Shared helpers for the data audit scripts: the Riyadh area, name normalisation, distance."""

from __future__ import annotations

import csv
import math
import re
import sys
import unicodedata
from pathlib import Path

# Windows prints through an old code page (cp1252) when output goes to a file or another program,
# which can't encode Arabic or "→". Every script imports this module, so fix it once here.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

OUT_DIR = Path(__file__).parent / "out"

# Greater Riyadh, generous enough to include Diriyah and the northern districts.
RIYADH_BBOX = {"south": 24.45, "north": 25.05, "west": 46.45, "east": 47.05}

_ARABIC_DIACRITICS = re.compile(r"[ً-ْٰـ]")  # harakat, dagger alef, tatweel
_ARABIC_FOLD = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي"})
_NOISE_RAW = {
    "cafe", "caffe", "caffee", "coffee", "the", "and", "restaurant", "co", "roasters", "roaster", "roastery", "specialty", "speciality",
    "مقهى", "كافيه", "كافية", "كافي", "قهوة", "مطعم", "محمصة", "روستري", "مختصة", "المختصة", "للقهوة",
}


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
    # Arabic joins "and" onto the next word ("ومحمصة" = "and roastery"), so check without a leading و too.
    words = [w for w in re.split(r"[^\w]+", s) if w and w not in _NOISE_WORDS and not (w.startswith("و") and w[1:] in _NOISE_WORDS)]
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


# ---------------------------------------------------------------- bilingual names

_ARABIC_CHAR = re.compile(r"[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]")
_LATIN_CHAR = re.compile(r"[A-Za-z\u00C0-\u024F]")
# Direction marks and other invisible formatting characters Google leaves in names.
_INVISIBLE = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]")
_SEPARATOR_TOKENS = {"|", "||", "-", "–", "—", "/", "I", "l", "·", "•", ":"}


def clean_text(s: str) -> str:
    """Remove invisible direction marks, stray quotes at the ends and repeated spaces."""
    s = _INVISIBLE.sub("", s or "")
    s = s.strip().strip("'\"’‘“” ")
    return re.sub(r"\s+", " ", s).strip()


def _script(token: str) -> str:
    if _ARABIC_CHAR.search(token):
        return "ar"
    if _LATIN_CHAR.search(token):
        return "en"
    return "neutral"


def split_bilingual(name: str) -> tuple[str, str]:
    """Split a name that mixes scripts into (english, arabic).

    Handles "Lahaj Cafe | لهج", "Markab - مركب", "Noma Speciality coffee I نوما القيروان",
    "أوزا كافيه Oaza cafe" (no separator) and branch names in brackets. A name in one script is
    returned in that slot only. Digits and symbols stay with the word before them.
    """
    s = clean_text(name).replace("(", " ").replace(")", " ")
    s = re.sub(r"\|\|?", " | ", s)  # make glued pipes ("Hampila|هامبيلا") separate tokens
    tokens = s.split()
    scripts = {_script(t) for t in tokens}
    if "ar" not in scripts or "en" not in scripts:
        text = re.sub(r"\s*\|\s*", " | ", " ".join(tokens)).strip(" |-")
        return (text, "") if "ar" not in scripts else ("", text)

    parts: dict[str, list[str]] = {"en": [], "ar": []}
    last = None
    for t in tokens:
        if t in _SEPARATOR_TOKENS:
            continue
        kind = _script(t)
        if kind == "neutral":
            if last:
                parts[last].append(t)
            continue
        parts[kind].append(t)
        last = kind
    tidy = lambda words: re.sub(r"\s+", " ", " ".join(words)).strip(" -|&,")  # noqa: E731
    return tidy(parts["en"]), tidy(parts["ar"])


# ---------------------------------------------------------------- addresses

_PLUS_CODE = re.compile(r"\b[23456789CFGHJMPQRVWX]{4}\+[23456789CFGHJMPQRVWX]{2,3}\b")
_SHORT_ADDRESS = re.compile(r"\b[A-Z]{4}\d{4}\b")  # Saudi national short address, e.g. RHOB7573
_CITY = re.compile(r"^(riyadh|diriyah|malham|الرياض|الدرعية|saudi arabia|السعودية)\b", re.I)
_STREET = re.compile(r"\b(rd|road|st|street|br|branch|ring|exit)\b\.?$", re.I)


def clean_address(address: str, name: str = "") -> str:
    """Drop the place name Google repeats at the front, plus codes and short-address codes."""
    a = clean_text(_PLUS_CODE.sub("", _SHORT_ADDRESS.sub("", clean_text(address))))
    names = {n.lower() for n in (clean_text(name), *split_bilingual(name)) if n}
    for n in sorted(names, key=len, reverse=True):
        if a.lower().startswith(n):
            a = a[len(n):]
            break
    parts = [p.strip() for p in re.split(r"[,،]", a)]
    return ", ".join(p for p in parts if p and p != "حي" and p.lower() not in names)


def area_from_address(address: str) -> str:
    """Best guess at the district: the last Latin, digit-free part before the city/postcode."""
    for part in reversed([p.strip() for p in re.split(r"[,،]", address)]):
        if not part or _CITY.match(part) or re.search(r"\d", part) or _ARABIC_CHAR.search(part):
            continue
        if _STREET.search(part) or len(part.split()) > 4:
            continue
        return part
    for part in reversed([p.strip() for p in re.split(r"[,،]", address)]):
        if part.startswith("حي ") and not re.search(r"\d", part):
            return part[3:].strip()
    return ""
