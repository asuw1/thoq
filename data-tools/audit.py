"""Audit place datasets against places you actually know.

Reads whichever of out/fsq_riyadh.csv and out/osm_riyadh.csv exist, plus your ground_truth.csv
(real places, with their real status), and writes out/report.md answering:

  - Coverage: of the places you know are open, how many does each source have?
  - Accuracy: how far off is the source's pin from the real location?
  - Staleness: does the source still list places you know have closed?
  - Completeness: how many rows have an Arabic name, phone, website, hours…?
  - Noise: likely duplicates (same name within 75 m).

Usage:
    python audit.py                                   # uses ground_truth.csv
    python audit.py --truth my_list.csv
"""

from __future__ import annotations

import argparse
import re
from collections import Counter
from datetime import date, datetime
from difflib import SequenceMatcher
from pathlib import Path

from common import OUT_DIR, haversine_m, normalize_name, read_csv

SOURCES = {"Foursquare OS Places": "fsq_riyadh.csv", "OpenStreetMap": "osm_riyadh.csv"}
ARABIC = re.compile(r"[؀-ۿ]")

# A candidate counts as the same place if names are near-identical, or similar and close by.
STRONG_NAME = 0.85
WEAK_NAME = 0.6
NEAR_M = 300
# With coordinates, a strong name match must still be in the same part of town (chains have many branches).
SAME_AREA_M = 1000


def name_similarity(a: str, b: str) -> float:
    a, b = normalize_name(a), normalize_name(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if len(a) >= 4 and len(b) >= 4 and (a in b or b in a):
        return 0.9
    return SequenceMatcher(None, a, b).ratio()


class NearbyIndex:
    """Buckets rows into ~1 km grid cells so a place is only compared with rows around it.
    Turns hundreds × tens of thousands of name comparisons into a few dozen per place."""

    CELL = 0.01  # degrees: ~1.1 km of latitude, ~1.0 km of longitude in Riyadh, ≥ SAME_AREA_M

    def __init__(self, rows: list[dict]):
        self.cells: dict[tuple[int, int], list[dict]] = {}
        for r in rows:
            lat, lng = _float(r.get("lat")), _float(r.get("lng"))
            if lat is not None and lng is not None:
                self.cells.setdefault(self._key(lat, lng), []).append(r)

    def _key(self, lat: float, lng: float) -> tuple[int, int]:
        return int(lat // self.CELL), int(lng // self.CELL)

    def near(self, lat: float, lng: float) -> list[dict]:
        y, x = self._key(lat, lng)
        return [r for dy in (-1, 0, 1) for dx in (-1, 0, 1) for r in self.cells.get((y + dy, x + dx), [])]


def best_match(truth: dict, rows: list[dict], index: NearbyIndex | None = None) -> tuple[dict | None, float, float | None]:
    """Best candidate for a ground-truth place: (row, name score, distance in metres or None)."""
    t_names = [n for n in (truth.get("name", ""), truth.get("name_ar", "")) if n]
    t_lat, t_lng = _float(truth.get("lat")), _float(truth.get("lng"))
    candidates = index.near(t_lat, t_lng) if index is not None and t_lat is not None and t_lng is not None else rows
    best, best_score, best_dist = None, 0.0, None
    for r in candidates:
        r_names = [n for n in (r.get("name", ""), r.get("name_ar", ""), r.get("name_en", "")) if n]
        score = max((name_similarity(a, b) for a in t_names for b in r_names), default=0.0)
        if score < WEAK_NAME:
            continue
        dist = None
        if t_lat is not None and t_lng is not None:
            dist = haversine_m(t_lat, t_lng, float(r["lat"]), float(r["lng"]))
        if dist is None:
            ok = score >= STRONG_NAME
        else:
            ok = dist <= NEAR_M or (score >= STRONG_NAME and dist <= SAME_AREA_M)
        if not ok:
            continue
        # With coordinates, the nearest acceptable candidate wins; without, the best name.
        better = (dist < best_dist) if (dist is not None and best_dist is not None) else score > best_score
        if best is None or better:
            best, best_score, best_dist = r, score, dist
    return best, best_score, best_dist


def _float(v) -> float | None:
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None


def _pct(n: int, d: int) -> str:
    return f"{(100 * n / d):.0f}%" if d else "—"


def _recent(value: str, today: date, days: int = 365) -> bool:
    try:
        return (today - datetime.fromisoformat(value[:10]).date()).days <= days
    except ValueError:
        return False


def duplicates(rows: list[dict]) -> int:
    """Pairs with the same normalised name within 75 m. Grid-bucketed so it stays fast."""
    buckets: dict[tuple, list[dict]] = {}
    for r in rows:
        key = normalize_name(r.get("name", ""))
        if key:
            buckets.setdefault((key, round(float(r["lat"]), 2), round(float(r["lng"]), 2)), []).append(r)
    count = 0
    for group in buckets.values():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                if haversine_m(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"])) <= 75:
                    count += 1
    return count


def completeness(rows: list[dict], today: date) -> list[tuple[str, str]]:
    n = len(rows)
    has = lambda f: sum(1 for r in rows if r.get(f))  # noqa: E731
    lines = [
        ("Places", str(n)),
        ("Cafés / restaurants / other", f"{sum(r['kind'] == 'cafe' for r in rows)} / {sum(r['kind'] == 'restaurant' for r in rows)} / {sum(r['kind'] == 'other' for r in rows)}"),
        ("Name contains Arabic", _pct(sum(1 for r in rows if ARABIC.search(r.get('name', '') + r.get('name_ar', ''))), n)),
        ("Has phone", _pct(has("tel") or has("phone"), n)),
        ("Has website", _pct(has("website"), n)),
    ]
    if rows and "instagram" in rows[0]:
        lines.append(("Has Instagram", _pct(has("instagram"), n)))
    if rows and "opening_hours" in rows[0]:
        lines.append(("Has opening hours", _pct(has("opening_hours"), n)))
    if rows and "date_refreshed" in rows[0]:
        lines.append(("Refreshed in the last 12 months", _pct(sum(1 for r in rows if _recent(r.get("date_refreshed", ""), today)), n)))
    if rows and "date_closed" in rows[0]:
        lines.append(("Marked closed", str(has("date_closed"))))
    lines.append(("Likely duplicate pairs", str(duplicates(rows))))
    return lines


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--truth", default=str(Path(__file__).parent / "ground_truth.csv"))
    ap.add_argument("--dir", default=str(OUT_DIR), help="Where the fetched CSVs are")
    ap.add_argument("--out", default=str(OUT_DIR / "report.md"))
    ap.add_argument("--today", default=date.today().isoformat(), help=argparse.SUPPRESS)
    args = ap.parse_args()
    today = date.fromisoformat(args.today)

    sources = {label: read_csv(Path(args.dir) / f) for label, f in SOURCES.items() if (Path(args.dir) / f).exists()}
    if not sources:
        raise SystemExit("No fetched data found. Run fetch_fsq.py and/or fetch_osm.py first.")
    truth_path = Path(args.truth)
    truth = read_csv(truth_path) if truth_path.exists() else []

    md = ["# Place data audit (Riyadh)", "", f"Generated {today.isoformat()} from {', '.join(sources)}.", ""]

    if truth:
        open_truth = [t for t in truth if t.get("status", "open").strip().lower() != "closed"]
        closed_truth = [t for t in truth if t.get("status", "").strip().lower() == "closed"]
        md += ["## Against places you know", "",
               f"{len(open_truth)} open and {len(closed_truth)} closed places in `{truth_path.name}`.", "",
               "| Source | Open places found | Median pin error | Closed places still listed as open |",
               "| --- | --- | --- | --- |"]
        details: dict[str, list[tuple[dict, dict | None, float, float | None]]] = {}
        by_kind: dict[str, list[str]] = {}
        for label, rows in sources.items():
            index = NearbyIndex(rows)
            matches = [(t, *best_match(t, rows, index)) for t in truth]
            details[label] = matches
            found = [m for m in matches if m[1] is not None and m[0] in open_truth]
            dists = sorted(m[3] for m in found if m[3] is not None)
            median = f"{dists[len(dists) // 2]:.0f} m" if dists else "—"
            stale = sum(1 for t, r, _, _ in matches if t in closed_truth and r is not None and not r.get("date_closed"))
            md.append(f"| {label} | {len(found)} / {len(open_truth)} ({_pct(len(found), len(open_truth))}) | {median} | {stale} / {len(closed_truth)} |")
            for kind, plural in (("cafe", "Cafés"), ("restaurant", "Restaurants")):
                of_kind = [t for t in open_truth if (t.get("kind") or "cafe").strip().lower() == kind]
                hit = sum(1 for m in found if (m[0].get("kind") or "cafe").strip().lower() == kind)
                if of_kind:
                    by_kind.setdefault(label, []).append(f"{plural} {hit} / {len(of_kind)} ({_pct(hit, len(of_kind))})")
        md += [""] + [f"- **{label}:** {' · '.join(parts)}" for label, parts in by_kind.items()]
        md += ["", "### Place by place", "", "| Place | Status | " + " | ".join(sources) + " |", "| --- | --- | " + " | ".join("---" for _ in sources) + " |"]
        for i, t in enumerate(truth):
            cells = []
            for label in sources:
                _, r, score, dist = details[label][i]
                if r is None:
                    cells.append("missing")
                else:
                    where = f", {dist:.0f} m off" if dist is not None else ""
                    closed = " (marked closed)" if r.get("date_closed") else ""
                    cells.append(f"“{r['name']}”{where}{closed}")
            md.append(f"| {t.get('name') or t.get('name_ar')} | {t.get('status', 'open') or 'open'} | " + " | ".join(cells) + " |")
        md.append("")
    else:
        md += ["## Against places you know", "", f"No `{truth_path.name}` found. Copy `ground_truth.example.csv`, fill in 30+ real places, and re-run.", ""]

    md += ["## Completeness", "", "| | " + " | ".join(sources) + " |", "| --- | " + " | ".join("---" for _ in sources) + " |"]
    columns = {label: dict(completeness(rows, today)) for label, rows in sources.items()}
    keys: list[str] = []
    for c in columns.values():
        keys += [k for k in c if k not in keys]
    for k in keys:
        md.append(f"| {k} | " + " | ".join(columns[label].get(k, "n/a") for label in sources) + " |")

    for label, rows in sources.items():
        top = Counter(r["category"].split(";")[0].strip() for r in rows if r.get("category")).most_common(12)
        md += ["", f"### Top categories: {label}", ""] + [f"- {cat or '(none)'}: {n}" for cat, n in top]

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"Report → {args.out}")


if __name__ == "__main__":
    main()
