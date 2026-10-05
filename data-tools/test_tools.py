"""Run with: python -m unittest test_tools.py  (no network needed)."""

from __future__ import annotations

import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import duckdb

from audit import best_match, duplicates, name_similarity
from common import normalize_name
from fetch_fsq import kind_of
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


if __name__ == "__main__":
    unittest.main()
