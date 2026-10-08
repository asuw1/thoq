"""Checks the migrations on a throwaway local database.

    python -m unittest supabase/tests/test_schema.py

Needs a local Postgres with PostGIS that `psql` can reach (PGHOST/PGUSER etc.). Skipped otherwise.
It never touches the real Supabase project.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import unittest
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
STUB = Path(__file__).with_name("supabase_stub.sql")


def psql(db: str, sql: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["psql", "-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1", "-d", db],
        input=sql, text=True, capture_output=True, check=check,
    )


def available() -> bool:
    try:
        out = psql("postgres", "select count(*) from pg_available_extensions where name = 'postgis';", check=False)
    except FileNotFoundError:
        return False
    return out.returncode == 0 and out.stdout.strip() == "1"


def band_score(reaction: str, index: int, size: int) -> float:
    """Python twin of bandScore() in src/reco/ranking.ts (both IEEE doubles, same operation order)."""
    lo, hi = {"loved": (6.7, 10.0), "fine": (3.4, 6.7), "disliked": (0.0, 3.4)}[reaction]
    return math.floor((hi - (index * (hi - lo)) / size) * 10 + 0.5) / 10


@unittest.skipUnless(available(), "needs a local Postgres with PostGIS")
class Schema(unittest.TestCase):
    db: str

    @classmethod
    def setUpClass(cls):
        cls.db = f"thoq_test_{uuid.uuid4().hex[:8]}"
        psql("postgres", f"create database {cls.db};")
        psql(cls.db, STUB.read_text(encoding="utf-8"))
        for m in MIGRATIONS:
            psql(cls.db, m.read_text(encoding="utf-8"))
        # Catalogue, loaded the way the loader does it (as the owner, bypassing RLS).
        psql(cls.db, """
            insert into categories values ('coffee','Coffee','قهوة','cafe'), ('saudi','Saudi & Yemeni','سعودي ويمني','restaurant');
            insert into places (id, name_en, name_ar, kind, lat, lng, area) values
              ('c1', 'Rex Coffee', 'مقهى ريكس', 'cafe', 24.7000, 46.7000, 'Al Olaya'),
              ('c2', 'Nabta', 'نبتة', 'cafe', 24.7050, 46.7000, 'Al Olaya'),
              ('c3', 'Far Cafe', '', 'cafe', 24.9000, 46.7000, 'North'),
              ('c4', 'Gone Cafe', '', 'cafe', 24.7010, 46.7000, 'Al Olaya'),
              ('r1', '', 'مندي الأصيل', 'restaurant', 24.7020, 46.7010, 'Al Olaya');
            update places set status = 'closed' where id = 'c4';
            insert into place_categories values ('c1','coffee','import'), ('c2','coffee','import'), ('r1','saudi','import');
        """)
        cls.alice, cls.bob = str(uuid.uuid4()), str(uuid.uuid4())
        psql(cls.db, f"insert into auth.users (id, phone) values ('{cls.alice}', '+966500000001'), ('{cls.bob}', '+966500000002');")

    @classmethod
    def tearDownClass(cls):
        psql("postgres", f"drop database if exists {cls.db} with (force);")

    def as_user(self, user: str | None, sql: str, check: bool = True) -> subprocess.CompletedProcess:
        role = "authenticated" if user else "anon"
        claim = f"select set_config('request.jwt.claim.sub', '{user or ''}', false);"
        return psql(self.db, f"set role {role}; {claim} {sql}", check=check)

    def rows(self, user: str | None, sql: str) -> list[str]:
        out = self.as_user(user, sql).stdout.strip().splitlines()
        return [line for line in out if line and line != self.claim_echo(user)]

    @staticmethod
    def claim_echo(user: str | None) -> str:
        return user or ""

    # ---------------------------------------------------------------- tests

    def test_signup_creates_profile_and_preferences(self):
        self.assertEqual(self.rows(self.alice, "select count(*) from profiles;"), ["2"])
        self.assertEqual(self.rows(self.alice, "select count(*) from preferences;"), ["1"])  # only her own

    def test_places_near_is_nearest_first_and_skips_closed_and_far(self):
        rows = self.rows(None, "select id, kind, categories from places_near(24.7, 46.7, 5);")
        self.assertEqual([r.split("|")[0] for r in rows], ["c1", "r1", "c2"])
        self.assertEqual(rows[0].split("|")[2], "{coffee}")
        self.assertEqual(self.rows(None, "select id from places_near(24.7, 46.7, 5, 'restaurant');"), ["r1"])

    def test_search_folds_arabic_and_ranks_prefix_first(self):
        self.assertEqual(self.rows(None, "select id from search_places('الاصيل');"), ["r1"])  # أ typed as ا
        self.assertEqual(self.rows(None, "select id from search_places('rex', 24.7, 46.7);"), ["c1"])
        self.assertEqual(self.rows(None, "select id from search_places('a', 24.7, 46.7);"), [])  # too short

    def test_rankings_scores_match_the_app_formula(self):
        entries = [{"place_id": "c2", "reaction": "loved"}, {"place_id": "c1", "reaction": "loved"},
                   {"place_id": "c3", "reaction": "fine"}]
        self.as_user(self.alice, f"select set_rankings('cafe', '{json.dumps(entries)}');")
        got = self.rows(self.alice, f"select place_id, score from ranking_scores where user_id = '{self.alice}' and kind = 'cafe' order by score desc;")
        want = [f"c2|{band_score('loved', 0, 2):g}", f"c1|{band_score('loved', 1, 2):g}", f"c3|{band_score('fine', 0, 1):g}"]
        self.assertEqual(got, want)

    def test_band_formula_parity_on_awkward_sizes(self):
        cases = [(r, i, n) for r in ("loved", "fine", "disliked") for n in (1, 2, 3, 6, 7, 9, 11, 13) for i in range(n)]
        values = ",".join(f"('{r}',{i},{n})" for r, i, n in cases)
        sql = f"""select floor((b.hi - (c.i * (b.hi - b.lo)) / c.n) * 10 + 0.5) / 10
                  from (values {values}) c(r, i, n)
                  join (values ('loved', 6.7::float8, 10.0::float8), ('fine', 3.4, 6.7), ('disliked', 0.0, 3.4)) b(r, lo, hi) using (r);"""
        got = [float(x) for x in psql(self.db, sql).stdout.split()]
        self.assertEqual(got, [band_score(r, i, n) for r, i, n in cases])

    def test_set_rankings_replaces_the_list_and_clears_unranked(self):
        self.as_user(self.bob, "insert into unranked (place_id, reaction) values ('c1', 'fine');")
        self.as_user(self.bob, """select set_rankings('cafe', '[{"place_id":"c1","reaction":"fine"},{"place_id":"c2","reaction":"fine"}]');""")
        self.as_user(self.bob, """select set_rankings('cafe', '[{"place_id":"c2","reaction":"loved"}]');""")
        self.assertEqual(self.rows(self.bob, f"select place_id, position from rankings where user_id = '{self.bob}' and kind = 'cafe';"), ["c2|0"])
        self.assertEqual(self.rows(self.bob, "select count(*) from unranked;"), ["0"])

    def test_set_rankings_rejects_wrong_kind_and_anonymous(self):
        bad = self.as_user(self.bob, """select set_rankings('cafe', '[{"place_id":"r1","reaction":"loved"}]');""", check=False)
        self.assertNotEqual(bad.returncode, 0)
        self.assertIn("is not a cafe", bad.stderr)
        anon = self.as_user(None, """select set_rankings('cafe', '[]');""", check=False)
        self.assertNotEqual(anon.returncode, 0)

    def test_nobody_writes_rankings_directly(self):
        out = self.as_user(self.bob, "insert into rankings (user_id, place_id, kind, reaction, position) "
                                     f"values ('{self.bob}', 'c3', 'cafe', 'loved', 5);", check=False)
        self.assertNotEqual(out.returncode, 0)

    def test_place_stats_average_everyone(self):
        self.as_user(self.alice, """select set_rankings('restaurant', '[{"place_id":"r1","reaction":"loved"}]');""")
        self.as_user(self.bob, """select set_rankings('restaurant', '[{"place_id":"r1","reaction":"fine"}]');""")
        self.assertEqual(self.rows(self.alice, "select avg_score, ratings from place_stats where place_id = 'r1';"), ["8.4|2"])
        self.assertEqual(self.rows(self.alice, "select avg_score, ratings from places_near(24.7, 46.7, 5, 'restaurant');"), ["8.4|2"])

    def test_private_tables_stay_private(self):
        self.as_user(self.alice, "insert into saved (place_id) values ('c1');")
        self.as_user(self.alice, "insert into impressions (place_id, surface, slot) values ('c1', 'for_you', 0);")
        self.as_user(self.alice, "insert into comparisons (place_id, other_id, answer) values ('c1', 'c2', 'new');")
        for table in ("saved", "impressions", "comparisons", "preferences"):
            self.assertEqual(self.rows(self.bob, f"select count(*) from {table} where user_id = '{self.alice}';"), ["0"], table)
        self.assertEqual(self.rows(self.alice, "select count(*) from saved;"), ["1"])

    def test_you_cannot_write_as_someone_else(self):
        for sql in (f"insert into visits (user_id, place_id, visited_on, reaction) values ('{self.alice}', 'c1', current_date, 'loved');",
                    f"insert into impressions (user_id, place_id, surface) values ('{self.alice}', 'c1', 'for_you');",
                    f"update profiles set name = 'hacked' where id = '{self.alice}' returning id;"):
            out = self.as_user(self.bob, sql, check=False)
            self.assertTrue(out.returncode != 0 or out.stdout.strip() in ("", self.bob), sql)
        self.assertEqual(self.rows(self.alice, "select count(*) from profiles where name = 'hacked';"), ["0"])

    def test_lists_only_owner_fills_them(self):
        list_id = self.rows(self.alice, "insert into lists (title) values ('Weekend coffee') returning id;")[0]
        self.as_user(self.alice, f"insert into list_items (list_id, place_id) values ('{list_id}', 'c1');")
        out = self.as_user(self.bob, f"insert into list_items (list_id, place_id) values ('{list_id}', 'c2');", check=False)
        self.assertNotEqual(out.returncode, 0)
        self.assertEqual(self.rows(self.bob, f"select place_id from list_items where list_id = '{list_id}';"), ["c1"])

    def test_catalogue_is_read_only_for_users(self):
        out = self.as_user(self.alice, "update places set name_en = 'x' where id = 'c1' returning id;", check=False)
        self.assertTrue(out.returncode != 0 or out.stdout.strip() in ("", self.alice))
        self.assertEqual(self.rows(None, "select name_en from places where id = 'c1';"), ["Rex Coffee"])


if __name__ == "__main__":
    unittest.main()
