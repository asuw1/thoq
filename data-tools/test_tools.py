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

from audit import WEAK_NAME, NearbyIndex, best_match, duplicates, name_similarity
from common import area_from_address, clean_address, normalize_name, split_bilingual
from merge_truth import merge
from fetch_fsq import kind_of
from fetch_gmaps_list import extract_places, list_id_from, parse_payload, to_rows
from fetch_osm import fetch, parse
from import_places import build, categorise, categorise_name, load_categories, load_name_rules, load_rules, ranked_with, thoq_id

HERE = Path(__file__).parent


class Names(unittest.TestCase):
    def test_normalise_latin_and_arabic(self):
        self.assertEqual(normalize_name("Nabta Café"), "nabta")
        self.assertEqual(normalize_name("مقهى نَبْتَة"), normalize_name("نبته"))
        self.assertEqual(normalize_name("أريج"), normalize_name("اريج"))
        self.assertEqual(normalize_name("مقهى ومحمصة بوسكو"), "بوسكو")
        self.assertEqual(normalize_name("Breehant coffee roastery."), "breehant")

    def test_similarity_on_real_audit_cases(self):
        # Same place: bilingual source names, branch suffixes, spacing.
        for a, b in [("Hamra", "Hamra | حمراء"), ("Befine coffee", "BEFINE COFFEE- بي فاين كوفي"), ("COSMO Hittin", "COSMO"),
                     ("Wacafe Al Narjis", "Wacafe"), ("Brew 92", "Brew92° | ° برو٩٢"), ("By The Way BTW", "BTW By The Way"),
                     ("نفيس | قهوة مختصة", "NAFEES COFFEE | قهوة نفيس"), ("Hjeen Roaster Saudi 90’s", "Hjeen Roasters")]:
            self.assertGreaterEqual(name_similarity(a, b), 0.85, (a, b))
        # Different places that the first audit wrongly matched.
        for a, b in [("Out of Line Bakery", "Munch Bakery"), ("FOAM | in the Village", "The Village"),
                     ("Yanni Coffee & lounge", "Coffee & Lounge")]:
            self.assertLess(name_similarity(a, b), WEAK_NAME, (a, b))  # below the bar even when right next door
        # Similar-looking names are only accepted practically on top of each other: 239 m away is a different place.
        latea = {"name": "Latea", "lat": "24.7467", "lng": "46.6600"}
        self.assertIsNone(best_match({"name": "The gate coffee", "lat": "24.7446", "lng": "46.6601"}, [latea])[0])

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
            rows = list(csv.DictReader(out.read_text(encoding="utf-8").splitlines()))
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


class OverpassFallback(unittest.TestCase):
    def test_tries_next_server_after_a_certificate_error(self):
        import io
        import urllib.error

        tried = []

        def fake_open(req, timeout, context):
            tried.append(req.full_url)
            if len(tried) == 1:
                raise urllib.error.URLError("[SSL: CERTIFICATE_VERIFY_FAILED] certificate has expired")
            return io.BytesIO(b'{"elements": []}')

        self.assertEqual(fetch(["https://a.example/api", "https://b.example/api"], opener=fake_open), {"elements": []})
        self.assertEqual(tried, ["https://a.example/api", "https://b.example/api"])

    def test_explains_when_every_server_fails(self):
        import urllib.error

        def always_fail(req, timeout, context):
            raise urllib.error.URLError("[SSL: CERTIFICATE_VERIFY_FAILED] certificate has expired")

        with self.assertRaises(SystemExit) as ctx:
            fetch(["https://a.example/api"], opener=always_fail)
        self.assertIn("date and time", str(ctx.exception.code))


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
            self.assertEqual(len(list(csv.DictReader(out.read_text(encoding="utf-8").splitlines()))), 30)
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


class Catalogue(unittest.TestCase):
    """import_places.py: the real rule and category files, not copies, so a bad edit to them fails here."""

    @classmethod
    def setUpClass(cls):
        cls.rules, cls.cats, cls.names = load_rules(), load_categories(), load_name_rules()

    def cat(self, *labels):
        return categorise(list(labels), self.rules)

    def test_every_rule_names_a_real_category(self):
        unknown = {c for _, c in self.rules + self.names if c not in ("EXCLUDE", "KEEP") and c not in self.cats}
        self.assertEqual(unknown, set())

    def test_names_add_categories(self):
        self.assertEqual(categorise_name("مطعم مندي الشرق", self.names), (["saudi"], False))
        self.assertEqual(categorise_name("المندي الذهبي", self.names), (["saudi"], False))  # with ال
        self.assertEqual(categorise_name("Al Romansiah Kabsa | الرومانسية", self.names), (["saudi"], False))
        self.assertEqual(categorise_name("بروست الطازج", self.names), (["chicken"], False))
        self.assertEqual(categorise_name("فول وتميس أبو علي", self.names), (["breakfast"], False))
        self.assertEqual(categorise_name("Rex Coffee", self.names), ([], False))

    def test_names_never_match_inside_a_word(self):
        self.assertEqual(categorise_name("فولكس كافيه", self.names), ([], False))
        self.assertEqual(categorise_name("Mandil Bakery", self.names), ([], False))

    def test_names_block_shisha_and_staff_rooms(self):
        for name in ("RB Loung | شيشه", "مقهى السماء البيضاء لتقديم المشروبات والشيشة", "Turquoise Cigar Lounge",
                     "PCSD Staff Lounge", "Shisha Time", "معسل الأمير"):
            self.assertTrue(categorise_name(name, self.names)[1], name)
        self.assertFalse(categorise_name("BURGER LOUNGE | برجر لاونج", self.names)[1])

    def test_bars_shisha_and_lounges_are_excluded(self):
        for label in ("Dining and Drinking > Bar > Hookah Bar", "Dining and Drinking > Bar > Lounge",
                      "Dining and Drinking > Bar", "Dining and Drinking > Bar > Wine Bar"):
            self.assertTrue(self.cat(label)[1], label)

    def test_exclusion_beats_everything_else(self):
        cats, excluded, _ = self.cat("Dining and Drinking > Cafe, Coffee, and Tea House > Coffee Shop",
                                     "Dining and Drinking > Bar > Hookah Bar")
        self.assertTrue(excluded)
        self.assertEqual(cats, [])

    def test_whole_words_only(self):
        self.assertEqual(self.cat("Dining and Drinking > Restaurant > BBQ Joint")[:2], (["grill"], False))
        self.assertEqual(self.cat("Dining and Drinking > Restaurant > Barbecue Restaurant")[:2], (["grill"], False))
        self.assertEqual(self.cat("Dining and Drinking > Juice Bar")[:2], (["juice"], False))
        self.assertEqual(self.cat("Dining and Drinking > Restaurant > Steakhouse")[:2], (["grill"], False))

    def test_most_specific_step_wins(self):
        self.assertEqual(self.cat("Dining and Drinking > Cafe, Coffee, and Tea House > Tea Room")[0], ["tea"])
        self.assertEqual(self.cat("Dining and Drinking > Cafe, Coffee, and Tea House > Coffee Shop")[0], ["coffee"])
        self.assertEqual(self.cat("Dining and Drinking > Cafe, Coffee, and Tea House")[0], ["coffee"])
        self.assertEqual(self.cat("Dining and Drinking > Restaurant > Middle Eastern Restaurant > Lebanese Restaurant")[0], ["levantine"])
        self.assertEqual(self.cat("Dining and Drinking > Restaurant > Latin American Restaurant")[0], ["mexican"])
        self.assertEqual(self.cat("Dining and Drinking > Restaurant > American Restaurant")[0], ["american"])

    def test_several_labels_overlap(self):
        cats, excluded, kept = self.cat("Dining and Drinking > Cafe, Coffee, and Tea House > Coffee Shop",
                                        "Dining and Drinking > Bakery", "Dining and Drinking > Breakfast Spot")
        self.assertEqual((cats, excluded, kept), (["coffee", "bakery", "breakfast"], False, True))

    def test_plain_restaurant_is_kept_without_category(self):
        self.assertEqual(self.cat("Dining and Drinking > Restaurant"), ([], False, True))
        self.assertEqual(self.cat("Dining and Drinking > Restaurant > Ethiopian Restaurant"), ([], False, True))
        self.assertEqual(self.cat("Dining and Drinking > Food Court"), ([], False, False))

    def test_ranked_with(self):
        self.assertEqual(ranked_with(["coffee", "bakery", "breakfast"], self.cats, ""), "cafe")
        self.assertEqual(ranked_with(["burgers", "breakfast"], self.cats, ""), "restaurant")
        self.assertEqual(ranked_with(["coffee", "burgers"], self.cats, "Dining and Drinking > Cafe, Coffee, and Tea House > Café"), "cafe")
        self.assertEqual(ranked_with(["breakfast"], self.cats, "Dining and Drinking > Breakfast Spot"), "restaurant")
        self.assertEqual(ranked_with([], self.cats, "Dining and Drinking > Restaurant > Steakhouse"), "restaurant")

    def test_ids_are_stable(self):
        self.assertEqual(thoq_id("4b0588"), thoq_id("4b0588"))
        self.assertNotEqual(thoq_id("4b0588"), thoq_id("4b0589"))
        self.assertRegex(thoq_id("4b0588"), r"^p_[0-9a-f]{12}$")

    def row(self, sid, name, label, lat=24.7, lng=46.7, **extra):
        return {"source_id": sid, "name": name, "lat": str(lat), "lng": str(lng), "category": label,
                "address": "", "date_refreshed": "2025-01-01", **extra}

    def test_build_filters_merges_and_flags(self):
        coffee = "Dining and Drinking > Cafe, Coffee, and Tea House > Coffee Shop"
        rows = [
            self.row("a1", "Rex Coffee | مقهى ريكس", coffee),
            # Same place, older record, 20 m away, one more label: merged into a1.
            self.row("a2", "Rex Coffee", coffee + "; Dining and Drinking > Bakery", lat=24.70018, date_refreshed="2023-01-01"),
            # Same chain, other branch 2 km away: kept.
            self.row("a3", "Rex Coffee", coffee, lat=24.718),
            self.row("b1", "Smoke House", "Dining and Drinking > Bar > Hookah Bar", lat=24.8),
            self.row("c1", "Old Place", coffee, lat=24.81, date_closed="2024-03-01"),
            self.row("d1", "Blocked Café", coffee, lat=24.82),
            self.row("e1", "Yanni Coffee & Lounge", coffee, lat=24.83),
            self.row("f1", "Gym", "Sports and Recreation > Gym", lat=24.84),
            self.row("g1", "شيشة روبن", coffee, lat=24.85),
            self.row("h1", "مطعم مندي الشرق", "Dining and Drinking > Restaurant > Middle Eastern Restaurant", lat=24.86),
        ]
        places, excluded, labels, review = build(rows, self.rules, self.cats, {"d1"}, self.names)
        self.assertEqual(sorted(p["source_ids"][0] for p in places), ["a1", "a3", "e1", "h1"])
        mandi = next(p for p in places if p["source_ids"][0] == "h1")
        self.assertEqual((mandi["categories"], mandi["ranked_with"]), (["middle-eastern", "saudi"], "restaurant"))
        self.assertEqual(excluded["shisha / cigar / staff room (by name)"], 1)
        rex = next(p for p in places if p["source_ids"][0] == "a1")
        self.assertEqual(rex["source_ids"], ["a1", "a2"])
        self.assertEqual(rex["categories"], ["coffee", "bakery"])
        self.assertEqual((rex["name_en"], rex["name_ar"], rex["ranked_with"]), ("Rex Coffee", "مقهى ريكس", "cafe"))
        self.assertEqual(excluded["blocklist"], 1)
        self.assertEqual(excluded["closed"], 1)
        self.assertEqual(excluded["bar / shisha / lounge"], 1)
        self.assertEqual(excluded["not a café or restaurant"], 1)
        self.assertEqual(excluded["duplicate (merged)"], 1)
        self.assertEqual(labels["unmapped"]["Sports and Recreation > Gym"], 1)
        self.assertEqual([p["name_en"] for p in review], ["Yanni Coffee & Lounge"])

    def test_cli_writes_catalogue_with_notice(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "fsq.csv"
            with src.open("w", encoding="utf-8", newline="") as f:
                w = csv.DictWriter(f, fieldnames=["source_id", "name", "lat", "lng", "category", "address", "date_refreshed", "date_closed"])
                w.writeheader()
                w.writerow(self.row("a1", "Rex Coffee", "Dining and Drinking > Cafe, Coffee, and Tea House > Coffee Shop", date_closed=""))
            out = Path(tmp) / "catalogue"
            subprocess.run([sys.executable, str(HERE / "import_places.py"), "--input", str(src), "--out", str(out)],
                           check=True, capture_output=True, cwd=HERE)
            for name in ("places.csv", "places.json", "summary.md", "review_names.csv", "NOTICE.txt", "LICENSE.txt"):
                self.assertTrue((out / name).exists(), name)
            data = json.loads((out / "places.json").read_text(encoding="utf-8"))
            self.assertEqual(data[0]["categories"], ["coffee"])
            self.assertIn("Foursquare", (out / "NOTICE.txt").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
