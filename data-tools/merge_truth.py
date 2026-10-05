"""Merge an exported list (e.g. out/gmaps_list.csv) into ground_truth.csv, cleaned and de-duplicated.

    python merge_truth.py                       # merges out/gmaps_list.csv into ground_truth.csv
    python merge_truth.py --dry-run             # show what would happen, change nothing
    python merge_truth.py --incoming other.csv

What it does:
  - Splits mixed names ("Lahaj Cafe | لهج") into `name` and `name_ar`, in both files.
  - Cleans notes (drops the repeated name, plus codes, short-address codes) and fills `area` when empty.
  - Drops the template rows ("Example Roastery", "Example Grill").
  - Skips incoming places you already have: same name within 150 m. Different branches of a
    chain are further apart than that, so they're kept.
  - Backs up your current file to ground_truth.backup.csv before writing.
"""

from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path

from audit import name_similarity
from common import OUT_DIR, area_from_address, clean_address, clean_text, haversine_m, read_csv, split_bilingual, write_csv

FIELDS = ["name", "name_ar", "kind", "area", "status", "lat", "lng", "notes"]
LOOKS_LIKE_ADDRESS = re.compile(r"\b\d{5}\b|Riyadh|Diriyah|الرياض")
SAME_PLACE_M = 150
SAME_NAME = 0.85


def clean_row(row: dict) -> dict:
    """Normalise one ground-truth row. Rows you typed by hand keep their values; only obvious
    problems (mixed scripts in one column, stray marks, an empty area) are fixed."""
    name, name_ar = clean_text(row.get("name", "")), clean_text(row.get("name_ar", ""))
    if name and name_ar:
        en, ar = name, name_ar
    else:
        en, ar = split_bilingual(name or name_ar)
    notes = clean_text(row.get("notes", ""))
    # Exported rows end their notes with the address ("list note; address"). Only text that looks
    # like an address gets cleaned; hand-written notes are left exactly as typed.
    head, _, last = notes.rpartition("; ")
    address = ""
    if LOOKS_LIKE_ADDRESS.search(last):
        address = clean_address(last, name or name_ar)
        notes = "; ".join(x for x in (head, address) if x)
    return {
        "name": en,
        "name_ar": ar,
        "kind": clean_text(row.get("kind", "")) or "cafe",
        "area": clean_text(row.get("area", "")) or area_from_address(address),
        "status": (clean_text(row.get("status", "")) or "open").lower(),
        "lat": clean_text(row.get("lat", "")),
        "lng": clean_text(row.get("lng", "")),
        "notes": notes,
    }


def is_template(row: dict) -> bool:
    return row["name"].lower().startswith("example ")


def same_place(a: dict, b: dict) -> bool:
    score = max(
        (name_similarity(x, y) for x in (a["name"], a["name_ar"]) for y in (b["name"], b["name_ar"]) if x and y),
        default=0.0,
    )
    if score < SAME_NAME:
        return False
    try:
        return haversine_m(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"])) <= SAME_PLACE_M
    except ValueError:
        return True  # no coordinates on one side: same name is the best evidence we have


def merge(existing: list[dict], incoming: list[dict]) -> tuple[list[dict], list[dict], list[tuple[dict, dict]]]:
    """Returns (merged rows, template rows removed, (skipped incoming, matching kept row) pairs)."""
    kept = [clean_row(r) for r in existing]
    removed = [r for r in kept if is_template(r)]
    kept = [r for r in kept if not is_template(r)]
    skipped: list[tuple[dict, dict]] = []
    for raw in incoming:
        row = clean_row(raw)
        if not (row["name"] or row["name_ar"]):
            continue
        match = next((k for k in kept if same_place(row, k)), None)
        if match:
            skipped.append((row, match))
        else:
            kept.append(row)
    return kept, removed, skipped


def main() -> None:
    here = Path(__file__).parent
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--truth", default=str(here / "ground_truth.csv"))
    ap.add_argument("--incoming", default=str(OUT_DIR / "gmaps_list.csv"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    truth, incoming = Path(args.truth), Path(args.incoming)
    existing = read_csv(truth) if truth.exists() else []
    new_rows = read_csv(incoming)
    merged, removed, skipped = merge(existing, new_rows)

    added = len(merged) - (len(existing) - len(removed))
    print(f"{len(existing)} rows in {truth.name} · {len(new_rows)} incoming from {incoming.name}")
    print(f"  removed {len(removed)} template row(s), skipped {len(skipped)} duplicate(s), added {added}")
    for row, match in skipped:
        print(f"    skip “{row['name'] or row['name_ar']}” = your “{match['name'] or match['name_ar']}”")
    print(f"  → {len(merged)} rows ({sum(r['status'] == 'closed' for r in merged)} closed)")

    if args.dry_run:
        print("Dry run: nothing written.")
        return
    backed_up = truth.exists()
    if backed_up:
        shutil.copy(truth, truth.with_name("ground_truth.backup.csv"))
    write_csv(truth, merged, FIELDS)
    print(f"Wrote {truth}" + (" (previous version saved as ground_truth.backup.csv)" if backed_up else ""))


if __name__ == "__main__":
    main()
