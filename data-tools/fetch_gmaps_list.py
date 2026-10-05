"""Export one shared Google Maps list (name, coordinates, address, list note) to CSV.

Usage:
    python fetch_gmaps_list.py "https://maps.app.goo.gl/XXXX"
    python fetch_gmaps_list.py "https://maps.app.goo.gl/XXXX" --sample 20     # also write a random sample
    python fetch_gmaps_list.py --input raw.json                               # parse a saved response

Writes out/gmaps_list.csv in the same columns as ground_truth.csv, so rows can be copied straight in.
With --sample N it also writes out/gmaps_sample.csv: N random places, the fairest way to pick audit rows.

Google's list endpoint is undocumented. The parser looks for the *shape* of a place (a name next
to a [null, null, lat, lng] pair) rather than fixed positions, so small format changes don't break
it. If it ever finds nothing, re-run with --dump raw.json and send the file over.
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from common import OUT_DIR, write_csv

FIELDS = ["name", "name_ar", "kind", "area", "status", "lat", "lng", "notes"]
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
ARABIC = re.compile(r"[؀-ۿ]")


def _get(url: str) -> tuple[str, str]:
    """GET a URL following redirects. Returns (final_url, body)."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.geturl(), resp.read().decode("utf-8", errors="replace")


def list_id_from(text: str) -> str | None:
    """Pull the list id out of a Maps URL. Handles consent-page redirects (?continue=...)."""
    for candidate in (text, urllib.parse.unquote(text), urllib.parse.unquote(urllib.parse.unquote(text))):
        m = re.search(r"!11m\d+!2s([A-Za-z0-9_-]{10,})", candidate) or re.search(r"!2s([A-Za-z0-9_-]{16,})", candidate)
        if m:
            return m.group(1)
    return None


def resolve_list_id(url: str) -> str:
    direct = list_id_from(url)
    if direct:
        return direct
    final_url, body = _get(url)
    found = list_id_from(final_url) or list_id_from(body)
    if not found:
        sys.exit(
            "Couldn't find a list id. Open the link in a browser, wait for the list to load, then copy the full\n"
            "URL from the address bar (it contains '!2s…') and pass that instead."
        )
    return found


def fetch_list(list_id: str) -> object:
    pb = f"!1m4!1s{list_id}!2e1!3m1!1e1!2e2!3e2!4i500!16b1"
    url = f"https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=sa&pb={urllib.parse.quote(pb, safe='!')}"
    _, body = _get(url)
    return parse_payload(body)


def parse_payload(body: str) -> object:
    """Google prefixes JSON with )]}' to stop it being run as a script; strip that."""
    body = body.lstrip()
    if body.startswith(")]}'"):
        body = body[4:]
    return json.loads(body)


def _coords(node: object, depth: int = 0) -> tuple[float, float] | None:
    """Find a [null, null, lat, lng] quadruple within a few levels of `node`."""
    if not isinstance(node, list) or depth > 3:
        return None
    if (
        len(node) >= 4 and node[0] is None and node[1] is None
        and isinstance(node[2], (int, float)) and isinstance(node[3], (int, float))
        and -90 <= node[2] <= 90 and -180 <= node[3] <= 180
    ):
        return float(node[2]), float(node[3])
    for child in node:
        found = _coords(child, depth + 1)
        if found:
            return found
    return None


def _address(node: object) -> str:
    """The longest plain string inside the place's info block: that's the address."""
    if not isinstance(node, list):
        return ""
    strings = [s for s in node if isinstance(s, str) and len(s) > 3 and not s.startswith("/g/")]
    return max(strings, key=len, default="")


def extract_places(data: object) -> list[dict]:
    """Walk the whole payload and collect anything shaped like a list entry:
    [_, [info…, [null, null, lat, lng], …], "Name", "note"?, …]."""
    out: list[dict] = []
    seen: set[tuple] = set()

    def walk(node: object) -> None:
        if not isinstance(node, list):
            return
        if len(node) >= 3 and isinstance(node[1], list) and isinstance(node[2], str) and node[2].strip():
            c = _coords(node[1])
            if c:
                key = (node[2].strip(), round(c[0], 6), round(c[1], 6))
                if key not in seen:
                    seen.add(key)
                    note = node[3] if len(node) > 3 and isinstance(node[3], str) else ""
                    out.append({"name": node[2].strip(), "lat": c[0], "lng": c[1], "address": _address(node[1]), "note": note.strip()})
                return
        for child in node:
            walk(child)

    walk(data)
    return out


def to_rows(places: list[dict]) -> list[dict]:
    rows = []
    for p in places:
        arabic = bool(ARABIC.search(p["name"]))
        notes = "; ".join(x for x in (p["note"], p["address"]) if x)
        rows.append({
            "name": "" if arabic else p["name"],
            "name_ar": p["name"] if arabic else "",
            "kind": "cafe",
            "area": "",
            "status": "open",
            "lat": f"{p['lat']:.7f}",
            "lng": f"{p['lng']:.7f}",
            "notes": notes,
        })
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url", nargs="?", help="Shared list link (maps.app.goo.gl/… or a full google.com/maps URL)")
    ap.add_argument("--input", help="Parse a saved raw response instead of fetching")
    ap.add_argument("--dump", help="Save the raw response here (for debugging)")
    ap.add_argument("--sample", type=int, default=0, help="Also write N random places to out/gmaps_sample.csv")
    ap.add_argument("--seed", type=int, default=7, help="Random seed for --sample (same seed = same sample)")
    ap.add_argument("--out", default=str(OUT_DIR / "gmaps_list.csv"))
    args = ap.parse_args()

    if args.input:
        data = parse_payload(Path(args.input).read_text(encoding="utf-8"))
    elif args.url:
        list_id = resolve_list_id(args.url)
        print(f"List id {list_id}")
        data = fetch_list(list_id)
    else:
        ap.error("pass a list URL or --input")

    if args.dump:
        Path(args.dump).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    places = extract_places(data)
    if not places:
        sys.exit("Found no places in the response. Re-run with --dump raw.json and send that file over.")

    rows = to_rows(places)
    write_csv(Path(args.out), rows, FIELDS)
    print(f"{len(rows)} places → {args.out}")

    if args.sample:
        sample = random.Random(args.seed).sample(rows, min(args.sample, len(rows)))
        sample_path = Path(args.out).with_name("gmaps_sample.csv")
        write_csv(sample_path, sample, FIELDS)
        print(f"{len(sample)} random places → {sample_path}  (check each is really open before adding to ground_truth.csv)")


if __name__ == "__main__":
    main()
