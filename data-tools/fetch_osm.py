"""Pull Riyadh cafés and restaurants from OpenStreetMap via the Overpass API.

OSM data is ODbL-licensed: free to use, but if we publish a *database* built from it, improvements
to that database must be shared under the same licence. Fine for comparison; think carefully
before making it Thoq's catalogue.

Usage:
    python fetch_osm.py                      # live query
    python fetch_osm.py --input saved.json   # parse a saved Overpass response (offline / testing)

Writes out/osm_riyadh.csv and prints a short summary.
"""

from __future__ import annotations

import argparse
import json
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from common import OUT_DIR, RIYADH_BBOX, write_csv

# Public Overpass servers, tried in order. They're volunteer-run; any one can be down or misconfigured.
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
AMENITIES = {"cafe": "cafe", "restaurant": "restaurant", "fast_food": "restaurant", "ice_cream": "cafe"}
SHOPS = {"bakery": "cafe", "coffee": "cafe", "pastry": "cafe", "confectionery": "cafe"}

FIELDS = ["source_id", "name", "name_ar", "name_en", "lat", "lng", "kind", "category", "cuisine",
          "opening_hours", "website", "phone", "check_date"]


def build_query() -> str:
    b = RIYADH_BBOX
    bbox = f"{b['south']},{b['west']},{b['north']},{b['east']}"
    amenity = "|".join(AMENITIES)
    shop = "|".join(SHOPS)
    return f"""[out:json][timeout:180];
(
  nwr["amenity"~"^({amenity})$"]({bbox});
  nwr["shop"~"^({shop})$"]({bbox});
);
out center tags;"""


def parse(payload: dict) -> list[dict]:
    rows = []
    for el in payload.get("elements", []):
        tags = el.get("tags", {})
        lat = el.get("lat", el.get("center", {}).get("lat"))
        lng = el.get("lon", el.get("center", {}).get("lon"))
        if lat is None or lng is None:
            continue
        amenity, shop = tags.get("amenity", ""), tags.get("shop", "")
        kind = AMENITIES.get(amenity) or SHOPS.get(shop) or "other"
        rows.append({
            "source_id": f"{el.get('type', 'node')}/{el.get('id')}",
            "name": tags.get("name", ""),
            "name_ar": tags.get("name:ar", ""),
            "name_en": tags.get("name:en", ""),
            "lat": lat,
            "lng": lng,
            "kind": kind,
            "category": amenity or f"shop={shop}",
            "cuisine": tags.get("cuisine", ""),
            "opening_hours": tags.get("opening_hours", ""),
            "website": tags.get("website", tags.get("contact:website", "")),
            "phone": tags.get("phone", tags.get("contact:phone", "")),
            "check_date": tags.get("check_date", ""),
        })
    return rows


def ssl_context() -> ssl.SSLContext:
    """Verify certificates against certifi's up-to-date bundle when it's installed.
    Windows' own certificate store can be stale, which shows up as 'certificate has expired'.
    Verification is never turned off."""
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def fetch(endpoints: list[str] | None = None, opener=urllib.request.urlopen) -> dict:
    data = urllib.parse.urlencode({"data": build_query()}).encode()
    errors = []
    for url in endpoints or ENDPOINTS:
        host = urllib.parse.urlparse(url).hostname
        print(f"Querying {host}…")
        req = urllib.request.Request(url, data=data, headers={"User-Agent": "thoq-data-audit/0.1"})
        try:
            with opener(req, timeout=240, context=ssl_context()) as resp:
                return json.load(resp)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            reason = getattr(e, "reason", e)
            print(f"  failed: {reason}")
            errors.append(f"{host}: {reason}")
    hint = ""
    if any("CERTIFICATE" in e.upper() for e in errors):
        hint = (
            "\nCertificate errors: check your PC's date and time are correct, then run\n"
            "  pip install --upgrade certifi\n"
            "and try again. If a browser also warns on https://overpass-api.de/api/status, that server is at fault."
        )
    sys.exit("Every Overpass server failed:\n  " + "\n  ".join(errors) + hint)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", help="Parse a saved Overpass JSON response instead of querying.")
    ap.add_argument("--out", default=str(OUT_DIR / "osm_riyadh.csv"))
    args = ap.parse_args()

    payload = json.loads(Path(args.input).read_text(encoding="utf-8")) if args.input else fetch()
    rows = parse(payload)
    write_csv(Path(args.out), rows, FIELDS)

    named = sum(1 for r in rows if r["name"])
    hours = sum(1 for r in rows if r["opening_hours"])
    by_kind = {k: sum(1 for r in rows if r["kind"] == k) for k in ("cafe", "restaurant")}
    print(f"{len(rows)} places → {args.out}")
    print(f"  cafés {by_kind['cafe']} · restaurants {by_kind['restaurant']} · named {named} · with opening hours {hours}")


if __name__ == "__main__":
    main()
