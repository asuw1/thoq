"""Turn the raw Foursquare export into Thoq's place catalogue.

    python import_places.py                    # reads out/fsq_riyadh.csv
    python import_places.py --input other.csv

Steps, in order:
  1. Drop places on the blocklist (catalogue/blocklist.csv) and places Foursquare marks closed.
  2. Map Foursquare's category labels to Thoq categories (catalogue/category_rules.csv). A place can
     have many. Any EXCLUDE rule (bars, shisha, lounges…) removes the place, whatever else it is.
  3. Drop places no rule recognises (not a café or restaurant we'd show). A plain "Restaurant" is kept
     with no category yet; users and owners fill that in later.
  4. Merge duplicates: near-identical names within 50 m. The kept record takes the union of categories.
  5. Split names into English and Arabic, clean the address, work out the area.
  6. Decide "ranked with" (café or restaurant) from the categories.
  7. Give each place a permanent Thoq id derived from its Foursquare id.

Writes to out/catalogue/:
  places.csv         one row per place, ready for the database
  places.json        same data, for the app during development
  summary.md         counts per category and per exclusion reason, plus unmapped labels to review
  review_names.csv   places that survived but whose names mention lounge/shisha: check by hand,
                     add any that shouldn't be in Thoq to catalogue/blocklist.csv, re-run
  NOTICE.txt, LICENSE.txt   Foursquare's attribution, which must ship with the data
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
from collections import Counter
from pathlib import Path

from audit import NearbyIndex, name_similarity
from common import OUT_DIR, area_from_address, clean_address, clean_text, haversine_m, read_csv, split_bilingual, write_csv

HERE = Path(__file__).parent
CATALOGUE = HERE / "catalogue"

FIELDS = ["id", "source", "source_ids", "name_en", "name_ar", "ranked_with", "categories", "lat", "lng",
          "area", "address", "tel", "website", "instagram", "refreshed"]

DUPLICATE_M = 50
DUPLICATE_NAME = 0.9
REVIEW_WORDS = re.compile(r"lounge|shisha|hookah|شيشة|شيشه|معسل|لاونج", re.I)
CAFE_FIRST = re.compile(r"(?<!\w)(cafe|café|coffee|tea|bakery|dessert|juice|ice cream)(?!\w)", re.I)


# ---------------------------------------------------------------- rules

def _comment_free(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as f:
        lines = [line for line in f if line.strip() and not line.lstrip().startswith("#")]
    return list(csv.DictReader(lines))


def load_rules(path: Path = CATALOGUE / "category_rules.csv") -> list[tuple[re.Pattern, str]]:
    """Each rule becomes a whole-word regex. A trailing * means 'word starts with', a leading ^ means
    'only at the start of the step'."""
    rules = []
    for row in _comment_free(path):
        match, category = row["match"].strip().lower(), row["category"].strip()
        anchored, prefix = match.startswith("^"), match.endswith("*")
        body = re.escape(match.strip("^*"))
        # (?<!\w) rather than \b so the boundaries also behave next to non-Latin text.
        pattern = ("^" if anchored else r"(?<!\w)") + body + ("" if prefix else r"(?!\w)")
        rules.append((re.compile(pattern, re.I), category))
    return rules


def load_categories(path: Path = CATALOGUE / "categories.csv") -> dict[str, dict]:
    return {row["id"]: row for row in _comment_free(path)}


def categorise(labels: list[str], rules: list[tuple[re.Pattern, str]]) -> tuple[list[str], bool, bool]:
    """(Thoq categories, excluded?, kept?) for one place's Foursquare labels.

    Each label is a path ("Dining and Drinking > Restaurant > Lebanese Restaurant"). EXCLUDE rules are
    checked against every step. Other rules are checked from the most specific step upwards, and the
    first step that matches anything decides, so parents don't add their broader categories."""
    exclude = [p for p, c in rules if c == "EXCLUDE"]
    others = [(p, c) for p, c in rules if c != "EXCLUDE"]
    found: list[str] = []
    keep = False
    for label in labels:
        steps = [s.strip() for s in label.split(">") if s.strip()]
        if any(p.search(step) for p in exclude for step in steps):
            return [], True, False
        for step in reversed(steps):
            hits = [c for p, c in others if p.search(step)]
            if not hits:
                continue
            keep = True
            for c in hits:
                if c != "KEEP" and c not in found:
                    found.append(c)
            break
    return found, False, keep


def ranked_with(categories: list[str], catalogue: dict[str, dict], first_label: str) -> str:
    """Café or restaurant. Clear majority wins; a tie goes to the place's primary Foursquare label."""
    hints = Counter(catalogue[c]["ranked_with"] for c in categories if c in catalogue)
    if hints["cafe"] > hints["restaurant"]:
        return "cafe"
    if hints["restaurant"] > hints["cafe"]:
        return "restaurant"
    return "cafe" if CAFE_FIRST.search(first_label) else "restaurant"


def thoq_id(source_id: str) -> str:
    """Stable across re-imports: the same Foursquare place always gets the same Thoq id."""
    return "p_" + hashlib.sha1(f"fsq:{source_id}".encode()).hexdigest()[:12]


# ---------------------------------------------------------------- pipeline

def build(rows: list[dict], rules, catalogue, blocklist: set[str]) -> tuple[list[dict], Counter, dict[str, Counter], list[dict]]:
    """Returns (places, excluded-by-reason counts, {"unmapped"|"excluded": label counts}, names to review)."""
    excluded: Counter = Counter()
    unmapped: Counter = Counter()
    excluded_labels: Counter = Counter()
    candidates: list[dict] = []

    for r in rows:
        sid = r.get("source_id", "")
        if sid in blocklist:
            excluded["blocklist"] += 1
            continue
        if r.get("date_closed"):
            excluded["closed"] += 1
            continue
        labels = [l.strip() for l in (r.get("category") or "").split(";") if l.strip()]
        categories, is_excluded, keep = categorise(labels, rules)
        if is_excluded:
            excluded["bar / shisha / lounge"] += 1
            excluded_labels.update(labels)
            continue
        if not keep:
            excluded["not a café or restaurant"] += 1
            unmapped.update(labels or ["(no label)"])
            continue
        en, ar = split_bilingual(r.get("name", ""))
        if not (en or ar):
            excluded["no name"] += 1
            continue
        address = clean_address(r.get("address", ""), r.get("name", ""))
        candidates.append({
            "id": thoq_id(sid),
            "source": "foursquare",
            "source_ids": [sid],
            "name_en": en,
            "name_ar": ar,
            "ranked_with": ranked_with(categories, catalogue, labels[0] if labels else ""),
            "categories": categories,
            "lat": round(float(r["lat"]), 6),
            "lng": round(float(r["lng"]), 6),
            "area": area_from_address(address),
            "address": address,
            "tel": clean_text(r.get("tel", "")),
            "website": clean_text(r.get("website", "")),
            "instagram": clean_text(r.get("instagram", "")),
            "refreshed": clean_text(r.get("date_refreshed", ""))[:10],
        })

    places = merge_duplicates(candidates)
    excluded["duplicate (merged)"] = len(candidates) - len(places)
    review = [p for p in places if REVIEW_WORDS.search(f"{p['name_en']} {p['name_ar']}")]
    return places, excluded, {"unmapped": unmapped, "excluded": excluded_labels}, review


def merge_duplicates(places: list[dict]) -> list[dict]:
    """Near-identical names within 50 m are one place. The most recently refreshed record is kept."""
    ordered = sorted(places, key=lambda p: p["refreshed"], reverse=True)
    index = NearbyIndex([])
    kept: list[dict] = []
    for p in ordered:
        names = [n for n in (p["name_en"], p["name_ar"]) if n]
        dup = None
        for k in index.near(p["lat"], p["lng"]):
            if haversine_m(p["lat"], p["lng"], k["lat"], k["lng"]) > DUPLICATE_M:
                continue
            k_names = [n for n in (k["name_en"], k["name_ar"]) if n]
            if max((name_similarity(a, b) for a in names for b in k_names), default=0) >= DUPLICATE_NAME:
                dup = k
                break
        if dup:
            dup["source_ids"].append(p["source_ids"][0])
            dup["categories"] += [c for c in p["categories"] if c not in dup["categories"]]
            for field in ("name_en", "name_ar", "area", "address", "tel", "website", "instagram"):
                dup[field] = dup[field] or p[field]
        else:
            kept.append(p)
            index.cells.setdefault(index._key(p["lat"], p["lng"]), []).append(p)
    return kept


def summary(places: list[dict], excluded: Counter, labels: dict[str, Counter], catalogue: dict[str, dict], review: list[dict]) -> str:
    total_in = len(places) + sum(excluded.values())
    by_cat = Counter(c for p in places for c in p["categories"])
    multi = sum(1 for p in places if len(p["categories"]) > 1)
    uncategorised = sum(1 for p in places if not p["categories"])
    ranked = Counter(p["ranked_with"] for p in places)
    md = [
        "# Catalogue import", "",
        f"**{len(places):,} places** kept from {total_in:,} Foursquare rows · "
        f"{ranked['cafe']:,} ranked with cafés · {ranked['restaurant']:,} with restaurants · "
        f"{multi:,} ({100 * multi / max(1, len(places)):.0f}%) have more than one category · "
        f"{uncategorised:,} have none yet (a plain \"Restaurant\" or \"Café\" label)", "",
        "## Removed", "", "| Reason | Places |", "| --- | --- |",
        *[f"| {k} | {v:,} |" for k, v in excluded.most_common()], "",
        "## Places per category", "", "| Category | Places |", "| --- | --- |",
        *[f"| {catalogue.get(c, {}).get('label_en', c)} | {n:,} |" for c, n in by_cat.most_common()], "",
        f"## Names to review ({len(review)})", "",
        "These passed the category filter but their names mention lounge or shisha. See `review_names.csv`; "
        "add any that don't belong to `catalogue/blocklist.csv` and re-run.", "",
        "## Labels that got places excluded", "",
        "Check nothing here should be in Thoq. A wrong one means an EXCLUDE rule in `catalogue/category_rules.csv` is too broad.", "",
        *[f"- {label}: {n:,}" for label, n in labels["excluded"].most_common(40)], "",
        "## Unmapped Foursquare labels", "",
        "Places with only these labels were dropped. If one should be in Thoq, add a rule to `catalogue/category_rules.csv`.", "",
        *[f"- {label}: {n:,}" for label, n in labels["unmapped"].most_common(40)],
    ]
    return "\n".join(md) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", default=str(OUT_DIR / "fsq_riyadh.csv"))
    ap.add_argument("--out", default=str(OUT_DIR / "catalogue"))
    args = ap.parse_args()

    rules, catalogue = load_rules(), load_categories()
    unknown = {c for _, c in rules if c not in ("EXCLUDE", "KEEP") and c not in catalogue}
    if unknown:
        raise SystemExit(f"category_rules.csv uses categories missing from categories.csv: {sorted(unknown)}")
    blocklist = {row["source_id"] for row in read_csv(CATALOGUE / "blocklist.csv")}

    places, excluded, labels, review = build(read_csv(Path(args.input)), rules, catalogue, blocklist)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    flat = [{**p, "source_ids": "|".join(p["source_ids"]), "categories": "|".join(p["categories"])} for p in places]
    write_csv(out / "places.csv", flat, FIELDS)
    (out / "places.json").write_text(json.dumps(places, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    write_csv(out / "review_names.csv", [{"source_id": p["source_ids"][0], "name_en": p["name_en"], "name_ar": p["name_ar"],
                                          "categories": "|".join(p["categories"]), "lat": p["lat"], "lng": p["lng"]} for p in review],
              ["source_id", "name_en", "name_ar", "categories", "lat", "lng"])
    (out / "summary.md").write_text(summary(places, excluded, labels, catalogue, review), encoding="utf-8")
    shutil.copy(CATALOGUE / "FSQ_NOTICE.txt", out / "NOTICE.txt")
    shutil.copy(CATALOGUE / "FSQ_LICENSE.txt", out / "LICENSE.txt")

    print(f"{len(places):,} places → {out / 'places.csv'}")
    for reason, n in excluded.most_common():
        print(f"  removed {n:,}: {reason}")
    print(f"  {len(review)} names to review → {out / 'review_names.csv'}")
    print(f"Summary → {out / 'summary.md'}")


if __name__ == "__main__":
    main()
