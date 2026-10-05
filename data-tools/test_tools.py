"""Run with: python -m unittest test_tools.py  (no network needed)."""

from __future__ import annotations

import csv
import json
import subprocess
import sys
import tempfile
import unittest
import urllib.parse
from pathlib import Path

import duckdb

from audit import NearbyIndex, best_match, duplicates, name_similarity
from common import area_from_address, clean_address, normalize_name, split_bilingual
from merge_truth import merge
from fetch_fsq import kind_of
from fetch_gmaps_list import extract_places, list_id_from, parse_payload, to_rows
from fetch_osm import parse

HERE = Path(__file__).parent


class Names(unittest.TestCase):
    def test_normalise_latin_and_arabic(self):
        self.assertEqual(normalize_name("Nabta Café"), "nabta")
        self.assertEqual(normalize_name("مقهى نَبْتَة"), normalize_name("نبته"))
        self.assertEqual(normalize_name("أريج"), normalize_name("اريج"))
        self.assertEqual(normalize_name("مقهى ومحمصة بوسكو"), "بوسكو")
        self.assertEqual(normalize_name("Breehant coffee roastery."), "breehant")

    def test_similarity(self):
        self.assertEqual(name_similarity("Kiln & Cup", "KILN AND CUP"), 1.0)
        self.assertGreater(name_similarity("Hijra Coffee", "Hijra"), 0.85)
        self.assertLess(name_similarity("Hijra", "Lail"), 0.6)


class Matching(unittest.TestCase):
    rows = [
        {"name": "Nabta Coffee Lab", "lat": "24.8160", "lng": "46.6150"},
        {"name": "Nabta", "lat": "24.7000", "lng": "46.7000"},  # same name, other branch
        {"name": "Lail", "lat": "24.7660", "lng": "46.6060"},
    ]

    def test_prefers_nearest_branch_with_coordinates(self):
        r, score, dist = best_match({"name": "Nabta", "lat": "24.8161", "lng": "46.6151"}, self.rows)
        self.assertEqual(r["lat"], "24.8160")
        self.assertLess(dist, 50)

    def test_weak_name_needs_proximity(self):
        r, _, _ = best_match({"name": "Laili", "lat": "24.0", "lng": "46.0"}, self.rows)
        self.assertIsNone(r)

    def test_duplicates(self):
        rows = [{"name": "Lail", "lat": "24.7660", "lng": "46.6060"}, {"name": "LAIL café", "lat": "24.7662", "lng": "46.6061"}]
        self.assertEqual(duplicates(rows), 1)


class Fetchers(unittest.TestCase):
    def test_kind_of(self):
        self.assertEqual(kind_of(["Dining and Drinking > Cafe, Coffee, and Tea House > Coffee Shop"]), "cafe")
        self.assertEqual(kind_of(["Dining and Drinking > Restaurant > Middle Eastern Restaurant"]), "restaurant")
        self.assertEqual(kind_of(["Dining and Drinking > Bar"]), "other")

    def test_osm_parse_handles_nodes_and_ways(self):
        payload = {"elements": [
            {"type": "node", "id": 1, "lat": 24.8, "lon": 46.6, "tags": {"amenity": "cafe", "name": "X", "name:ar": "س", "opening_hours": "07:00-01:00"}},
            {"type": "way", "id": 2, "center": {"lat": 24.7, "lon": 46.7}, "tags": {"amenity": "fast_food", "name": "Y"}},
            {"type": "node", "id": 3, "tags": {"amenity": "cafe"}},  # no coordinates: skipped
        ]}
        rows = parse(payload)
        self.assertEqual([r["kind"] for r in rows], ["cafe", "restaurant"])
        self.assertEqual(rows[1]["source_id"], "way/2")

    def test_fsq_end_to_end_on_synthetic_parquet(self):
        with tempfile.TemporaryDirectory() as tmp:
            pq = Path(tmp) / "places.parquet"
            con = duckdb.connect()
            con.sql("""
              CREATE TABLE p AS SELECT * FROM (VALUES
                ('a1', 'Nabta Coffee Lab', 24.816, 46.615, 'SA', ['Dining and Drinking > Cafe, Coffee, and Tea House > Coffee Shop'], DATE '2025-06-01', NULL::DATE),
                ('a2', 'Najd Table', 24.731, 46.577, 'SA', ['Dining and Drinking > Restaurant > Saudi Restaurant'], DATE '2023-01-01', DATE '2024-05-01'),
                ('a3', 'Gym', 24.70, 46.70, 'SA', ['Sports and Recreation > Gym'], NULL::DATE, NULL::DATE),
                ('a4', 'Jeddah Cafe', 21.49, 39.19, 'SA', ['Dining and Drinking > Cafe, Coffee, and Tea House'], NULL::DATE, NULL::DATE)
              ) t(fsq_place_id, name, latitude, longitude, country, fsq_category_labels, date_refreshed, date_closed)
            """)
            con.sql(f"COPY p TO '{pq}' (FORMAT parquet)")
            out = Path(tmp) / "fsq.csv"
            res = subprocess.run([sys.executable, str(HERE / "fetch_fsq.py"), "--source", str(pq), "--out", str(out)],
                                 capture_output=True, text=True, cwd=HERE)
            self.assertEqual(res.returncode, 0, res.stderr)
            rows = list(csv.DictReader(out.open(encoding="utf-8")))
            self.assertEqual([r["name"] for r in rows], ["Nabta Coffee Lab", "Najd Table"])  # gym and Jeddah dropped
            self.assertEqual(rows[1]["date_closed"], "2024-05-01")

            # Audit the result against a ground truth with one open and one closed place.
            truth = Path(tmp) / "truth.csv"
            truth.write_text("name,status,lat,lng\nNabta,open,24.8161,46.6151\nNajd Table,closed,,\nMissing Place,open,,\n", encoding="utf-8")
            report = Path(tmp) / "report.md"
            fsq_dir = Path(tmp) / "data"
            fsq_dir.mkdir()
            out.rename(fsq_dir / "fsq_riyadh.csv")
            res = subprocess.run([sys.executable, str(HERE / "audit.py"), "--truth", str(truth), "--dir", str(fsq_dir),
                                  "--out", str(report), "--today", "2025-10-01"], capture_output=True, text=True, cwd=HERE)
            self.assertEqual(res.returncode, 0, res.stderr)
            text = report.read_text(encoding="utf-8")
            self.assertIn("| Foursquare OS Places | 1 / 2 (50%) |", text)
            self.assertIn("| 0 / 1 |", text)  # the closed place is correctly marked closed
            self.assertIn("missing", text)


class GoogleList(unittest.TestCase):
    def test_list_id_from_urls(self):
        full = "https://www.google.com/maps/@24.7,46.6,12z/data=!4m3!11m2!2sAbC123xyz_-QwErTy!3e3?entry=tts"
        self.assertEqual(list_id_from(full), "AbC123xyz_-QwErTy")
        consent = "https://consent.google.com/m?continue=" + urllib.parse.quote(full, safe="")
        self.assertEqual(list_id_from(consent), "AbC123xyz_-QwErTy")
        self.assertIsNone(list_id_from("https://maps.app.goo.gl/abc"))

    def test_extracts_places_from_nested_payload(self):
        place = lambda name, lat, lng, note="": [None, [None, None, "", None, "King Fahd Rd, Riyadh", [None, None, lat, lng], ["1", "2"], "/g/11abc"], name, note]  # noqa: E731
        payload = [["list-id", ["Riyadh cafés", None], None, None, None, None, None, None, [
            place("Rex Coffee", 24.8110328, 46.6461137, "good specialty"),
            place("هجين", 24.7339506, 46.6509861),
            place("Rex Coffee", 24.8110328, 46.6461137, "good specialty"),  # duplicate
        ]]]
        body = ")]}'\n" + json.dumps(payload, ensure_ascii=False)
        places = extract_places(parse_payload(body))
        self.assertEqual([p["name"] for p in places], ["Rex Coffee", "هجين"])
        self.assertEqual(places[0]["address"], "King Fahd Rd, Riyadh")
        rows = to_rows(places)
        self.assertEqual(rows[0]["notes"], "good specialty; King Fahd Rd, Riyadh")
        self.assertEqual((rows[1]["name"], rows[1]["name_ar"]), ("", "هجين"))
        self.assertEqual(rows[0]["lat"], "24.8110328")

    def test_cli_on_saved_response_with_sample(self):
        payload = [[None, [None, [None, None, i / 1000 + 24.7, 46.6], None], f"Cafe {i}"] for i in range(30)]
        with tempfile.TemporaryDirectory() as tmp:
            raw = Path(tmp) / "raw.json"
            raw.write_text(")]}'" + json.dumps(payload), encoding="utf-8")
            out = Path(tmp) / "gmaps_list.csv"
            cmd = [sys.executable, str(HERE / "fetch_gmaps_list.py"), "--input", str(raw), "--out", str(out), "--sample", "5"]
            res = subprocess.run(cmd, capture_output=True, text=True, cwd=HERE)
            self.assertEqual(res.returncode, 0, res.stderr)
            self.assertEqual(len(list(csv.DictReader(out.open(encoding="utf-8")))), 30)
            first = (Path(tmp) / "gmaps_sample.csv").read_text(encoding="utf-8")
            subprocess.run(cmd, capture_output=True, text=True, cwd=HERE)
            self.assertEqual((Path(tmp) / "gmaps_sample.csv").read_text(encoding="utf-8"), first)  # same seed, same sample
            self.assertEqual(len(first.strip().splitlines()), 6)


class Cleaning(unittest.TestCase):
    def test_split_bilingual(self):
        cases = {
            "Lahaj Cafe | لهج": ("Lahaj Cafe", "لهج"),
            "Markab - مركب": ("Markab", "مركب"),
            "أوزا كافيه Oaza cafe": ("Oaza cafe", "أوزا كافيه"),
            "Noma \u200fSpeciality coffee I نوما القيروان": ("Noma Speciality coffee", "نوما القيروان"),
            "قهوة عُمق 3.1 - UMQ Coffee 3.1": ("UMQ Coffee 3.1", "قهوة عُمق 3.1"),
            "وهف قهوة مختصة| WHF CAFE": ("WHF CAFE", "وهف قهوة مختصة"),
            "وَقَار l قهوة مختصة": ("", "وَقَار قهوة مختصة"),
            "محمصة شجرة الصحراء'": ("", "محمصة شجرة الصحراء"),
            "Alf\u200e": ("Alf", ""),
            "CAF LAB I Al Qairawan": ("CAF LAB I Al Qairawan", ""),  # one script: left alone
        }
        for raw, expected in cases.items():
            self.assertEqual(split_bilingual(raw), expected, raw)

    def test_address_and_area(self):
        a = clean_address("RJ72+2PG Sajiah, Al Malqa, Riyadh 13524", "Sajiah")
        self.assertEqual(a, "Al Malqa, Riyadh 13524")
        self.assertEqual(area_from_address(a), "Al Malqa")
        b = clean_address("Kaffix Cafe, حي, Olaya St, Al Olaya RHOB7573, Riyadh 12222", "Kaffix Cafe")
        self.assertEqual(area_from_address(b), "Al Olaya")
        self.assertEqual(area_from_address("7094 الامير طلال, حي الرفيعة, الرياض 12752"), "الرفيعة")
        self.assertEqual(area_from_address("Al Urubah Rd, Riyadh 12251"), "")

    def test_merge_dedupes_and_keeps_branches(self):
        existing = [
            {"name": "Example Roastery", "name_ar": "", "kind": "cafe", "status": "open", "lat": "24.8", "lng": "46.6", "notes": ""},
            {"name": "Rex Coffee", "name_ar": "مقهى ريكس", "kind": "cafe", "status": "open", "lat": "24.8110", "lng": "46.6461", "notes": "good specialty coffee"},
            {"name": "GUNBUN", "name_ar": "قن بن", "kind": "restaurant", "status": "closed", "lat": "24.7384", "lng": "46.6461", "notes": ""},
        ]
        incoming = [
            {"name": "", "name_ar": "Rex Coffee | ريكس", "lat": "24.8111", "lng": "46.6462", "notes": "Rex, Al Sahafah, Riyadh 13315"},  # same place
            {"name": "Rex coffee", "name_ar": "", "lat": "24.7699", "lng": "46.5852", "notes": "Rex coffee, Hittin, Riyadh 13518"},  # other branch
            {"name": "", "name_ar": "Lahaj Cafe | لهج", "lat": "24.7423", "lng": "46.5808", "notes": "Lahaj Cafe | لهج, Al Faisaliyah, Diriyah 13712"},
        ]
        merged, removed, skipped = merge(existing, incoming)
        self.assertEqual(len(removed), 1)
        self.assertEqual(len(skipped), 1)
        names = [(r["name"], r["name_ar"]) for r in merged]
        self.assertEqual(names, [("Rex Coffee", "مقهى ريكس"), ("GUNBUN", "قن بن"), ("Rex coffee", ""), ("Lahaj Cafe", "لهج")])
        self.assertEqual(merged[0]["notes"], "good specialty coffee")  # hand-written notes untouched
        self.assertEqual(merged[3]["area"], "Al Faisaliyah")
        self.assertEqual(merged[1]["status"], "closed")

    def test_nearby_index_only_returns_close_rows(self):
        rows = [{"name": "A", "lat": "24.7000", "lng": "46.7000"}, {"name": "B", "lat": "24.7900", "lng": "46.7000"}]
        near = NearbyIndex(rows).near(24.7005, 46.7004)
        self.assertEqual([r["name"] for r in near], ["A"])


if __name__ == "__main__":
    unittest.main()
