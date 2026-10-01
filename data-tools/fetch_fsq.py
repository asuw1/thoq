"""Pull Riyadh cafés and restaurants from Foursquare's open places dataset (FSQ OS Places).

The dataset is Apache-2.0 licensed: we may store, modify and build on it, as long as we keep
Foursquare's attribution (NOTICE.txt). It's published on Hugging Face as Parquet files; DuckDB
reads them remotely and only downloads the parts it needs.

Usage:
    python fetch_fsq.py --token hf_xxx            # or set HF_TOKEN
    python fetch_fsq.py --source 'local/*.parquet' # offline / testing

Writes out/fsq_riyadh.csv and prints a short summary.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

import duckdb

from common import OUT_DIR, RIYADH_BBOX, write_csv

REPO = "foursquare/fsq-os-places"

# Columns we want, if this release has them. Only the first four are required.
REQUIRED = ["name", "latitude", "longitude", "fsq_category_labels"]
OPTIONAL = [
    "fsq_place_id", "address", "locality", "region", "country", "postcode", "tel", "website",
    "instagram", "date_created", "date_refreshed", "date_closed",
]

FIELDS = ["source_id", "name", "lat", "lng", "kind", "category", "address", "locality", "tel", "website",
          "instagram", "date_created", "date_refreshed", "date_closed"]


def latest_release(token: str | None) -> str:
    """Find the newest release folder (release/dt=YYYY-MM-DD) on Hugging Face."""
    from huggingface_hub import HfApi

    files = HfApi().list_repo_files(REPO, repo_type="dataset", token=token)
    dates = sorted({m.group(1) for f in files if (m := re.match(r"release/dt=([\d-]+)/places/parquet/", f))})
    if not dates:
        sys.exit(f"No place releases found in {REPO}. Check the repo on huggingface.co.")
    return dates[-1]


def kind_of(labels: list[str]) -> str:
    """Map Foursquare's category labels to Thoq's two kinds. Anything else is kept as 'other'."""
    text = " | ".join(labels or []).lower()
    if any(k in text for k in ("cafe, coffee", "coffee", "tea room", "tea house", "bakery", "dessert", "juice bar")):
        return "cafe"
    if any(k in text for k in ("restaurant", "food truck", "food court", "steakhouse", "diner", "pizzeria")):
        return "restaurant"
    return "other"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--token", default=os.environ.get("HF_TOKEN"), help="Hugging Face token (or set HF_TOKEN)")
    ap.add_argument("--release", help="Release date, e.g. 2025-09-09. Default: newest.")
    ap.add_argument("--source", help="Override: a local Parquet path or glob (skips Hugging Face).")
    ap.add_argument("--out", default=str(OUT_DIR / "fsq_riyadh.csv"))
    args = ap.parse_args()

    con = duckdb.connect()
    if args.source:
        source = args.source
    else:
        release = args.release or latest_release(args.token)
        source = f"hf://datasets/{REPO}/release/dt={release}/places/parquet/*.parquet"
        con.sql("INSTALL httpfs; LOAD httpfs;")
        if args.token:
            safe = args.token.replace("'", "''")
            con.sql(f"CREATE SECRET hf (TYPE huggingface, TOKEN '{safe}')")
        print(f"Release {release}")
    print(f"Reading {source} (this can take a few minutes the first time)…")

    try:
        columns = {row[0] for row in con.sql(f"DESCRIBE SELECT * FROM read_parquet('{source}')").fetchall()}
    except duckdb.Error as e:
        sys.exit(
            f"Couldn't read {source}:\n  {e}\n\n"
            "If this is an access error: open https://huggingface.co/datasets/foursquare/fsq-os-places while logged in,\n"
            "accept the dataset terms if asked, and pass a token with read access (--token or HF_TOKEN)."
        )
    missing = [c for c in REQUIRED if c not in columns]
    if missing:
        sys.exit(f"This release is missing required columns {missing}. Found: {sorted(columns)}")
    wanted = REQUIRED + [c for c in OPTIONAL if c in columns]

    b = RIYADH_BBOX
    where = [
        f"latitude BETWEEN {b['south']} AND {b['north']}",
        f"longitude BETWEEN {b['west']} AND {b['east']}",
        "len(list_filter(fsq_category_labels, x -> x LIKE 'Dining and Drinking%')) > 0",
    ]
    if "country" in columns:
        where.append("country = 'SA'")
    query = f"SELECT {', '.join(wanted)} FROM read_parquet('{source}') WHERE {' AND '.join(where)}"
    rows = con.sql(query).fetchall()

    out = []
    for r in rows:
        rec = dict(zip(wanted, r))
        labels = list(rec.get("fsq_category_labels") or [])
        out.append({
            "source_id": rec.get("fsq_place_id", ""),
            "name": rec["name"] or "",
            "lat": rec["latitude"],
            "lng": rec["longitude"],
            "kind": kind_of(labels),
            "category": "; ".join(labels),
            "address": rec.get("address") or "",
            "locality": rec.get("locality") or "",
            "tel": rec.get("tel") or "",
            "website": rec.get("website") or "",
            "instagram": rec.get("instagram") or "",
            "date_created": rec.get("date_created") or "",
            "date_refreshed": rec.get("date_refreshed") or "",
            "date_closed": rec.get("date_closed") or "",
        })

    write_csv(Path(args.out), out, FIELDS)
    by_kind = {k: sum(1 for o in out if o["kind"] == k) for k in ("cafe", "restaurant", "other")}
    closed = sum(1 for o in out if o["date_closed"])
    print(f"{len(out)} places → {args.out}")
    print(f"  cafés {by_kind['cafe']} · restaurants {by_kind['restaurant']} · other dining {by_kind['other']} · marked closed {closed}")


if __name__ == "__main__":
    main()
