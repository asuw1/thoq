"""Load the catalogue (out/catalogue/) into the Supabase database.

    python load_places.py --dry-run     # check the files and show what would change, write nothing
    python load_places.py               # load

Needs the database connection string in the SUPABASE_DB_URL environment variable. In the Supabase
dashboard: Connect → Session pooler → copy the URI, and put your database password in it. Keep it
out of files and chat; set it in the terminal for this session only:

    $env:SUPABASE_DB_URL = "postgresql://postgres.xxxx:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"

Safe to re-run after every import:
  - New places are added, existing ones updated in place (same Thoq id).
  - Categories from the import are replaced; ones added by users, owners or a model are left alone.
  - Places missing from the new import are marked `retired`, never deleted, so rankings that point at
    them still work. It refuses if the new file is less than half the size of what's live (a cut-off
    file shouldn't retire the city); --force overrides.
  - Everything happens in one transaction: it all lands or none of it does.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from common import OUT_DIR, read_csv
from import_places import load_categories

PLACE_COLUMNS = ["id", "source", "source_ids", "name_en", "name_ar", "kind", "lat", "lng", "area", "address",
                 "tel", "website", "instagram", "refreshed", "categories"]


def rows_for_db(places: list[dict]) -> list[tuple]:
    out = []
    for p in places:
        if p["ranked_with"] not in ("cafe", "restaurant"):
            raise SystemExit(f"Place {p['id']} has ranked_with={p['ranked_with']!r}; expected cafe or restaurant.")
        out.append((
            p["id"], p["source"], [s for s in p["source_ids"].split("|") if s],
            p["name_en"], p["name_ar"], p["ranked_with"], float(p["lat"]), float(p["lng"]), p["area"], p["address"],
            p["tel"], p["website"], p["instagram"], p["refreshed"] or None, p["categories"],
        ))
    return out


LOAD_SQL = """
create temp table staging (
  id text primary key, source text, source_ids text[], name_en text, name_ar text, kind text,
  lat double precision, lng double precision, area text, address text, tel text, website text,
  instagram text, refreshed date, categories text
) on commit drop;
"""

APPLY_SQL = """
insert into public.places as p (id, source, source_ids, name_en, name_ar, kind, lat, lng, area, address,
                                tel, website, instagram, refreshed)
select id, source, source_ids, name_en, name_ar, kind, lat, lng, area, address, tel, website, instagram, refreshed
from staging
on conflict (id) do update set
  source_ids = excluded.source_ids, name_en = excluded.name_en, name_ar = excluded.name_ar,
  kind = excluded.kind, lat = excluded.lat, lng = excluded.lng, area = excluded.area,
  address = excluded.address, tel = excluded.tel, website = excluded.website,
  instagram = excluded.instagram, refreshed = excluded.refreshed, updated_at = now(),
  -- Back in the import: un-retire. A place confirmed closed by hand stays closed.
  status = case when p.status = 'retired' then 'open' else p.status end;

delete from public.place_categories pc using staging s where pc.place_id = s.id and pc.source = 'import';

insert into public.place_categories (place_id, category_id, source)
select s.id, c, 'import'
from staging s, unnest(string_to_array(nullif(s.categories, ''), '|')) as c
on conflict do nothing;
"""

RETIRE_SQL = """
update public.places p set status = 'retired', updated_at = now()
where p.source = 'foursquare' and p.status = 'open' and not exists (select 1 from staging s where s.id = p.id);
"""


def connect(url: str):
    try:
        import psycopg
    except ImportError:
        raise SystemExit("psycopg is missing. Run: pip install -r requirements.txt")
    try:
        return psycopg.connect(url, connect_timeout=15)
    except psycopg.OperationalError as e:
        hint = ""
        if "could not translate host name" in str(e) or "Network is unreachable" in str(e):
            hint = ("\nUse the *Session pooler* URI from Connect in the Supabase dashboard. The direct one needs IPv6, "
                    "which most home networks don't have.")
        if "password authentication failed" in str(e):
            hint = "\nThe password in SUPABASE_DB_URL is wrong. Reset it under Project Settings → Database if needed."
        raise SystemExit(f"Could not connect: {str(e).strip()}{hint}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--catalogue", default=str(OUT_DIR / "catalogue"))
    ap.add_argument("--dry-run", action="store_true", help="Show what would change, then roll back.")
    ap.add_argument("--force", action="store_true", help="Retire missing places even if the new file is much smaller.")
    args = ap.parse_args()

    url = os.environ.get("SUPABASE_DB_URL", "")
    if not url:
        raise SystemExit("Set SUPABASE_DB_URL first (see the top of this file, or python load_places.py --help).")

    folder = Path(args.catalogue)
    places = read_csv(folder / "places.csv")
    categories = list(load_categories().values())
    if not places:
        raise SystemExit(f"No places in {folder / 'places.csv'}. Run import_places.py first.")
    rows = rows_for_db(places)

    with connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute("select count(*) from public.places where source = 'foursquare' and status = 'open'")
            live = cur.fetchone()[0]
            if live and len(rows) < live / 2 and not args.force:
                raise SystemExit(f"The new file has {len(rows):,} places but {live:,} are live. "
                                 "That looks like a cut-off file; nothing was changed. Use --force if it's intended.")

            cur.executemany(
                "insert into public.categories (id, label_en, label_ar, ranked_with) values (%s, %s, %s, %s) "
                "on conflict (id) do update set label_en = excluded.label_en, label_ar = excluded.label_ar, "
                "ranked_with = excluded.ranked_with",
                [(c["id"], c["label_en"], c["label_ar"], c["ranked_with"]) for c in categories],
            )
            cur.execute(LOAD_SQL)
            with cur.copy("copy staging (" + ", ".join(PLACE_COLUMNS) + ") from stdin") as copy:
                copy.set_types(["text", "text", "text[]", "text", "text", "text", "float8", "float8", "text", "text",
                                "text", "text", "text", "date", "text"])
                for r in rows:
                    copy.write_row(r)

            cur.execute("select count(*) from staging s where not exists (select 1 from public.places p where p.id = s.id)")
            new = cur.fetchone()[0]
            cur.execute(APPLY_SQL)
            cur.execute(RETIRE_SQL)
            retired = cur.rowcount
            cur.execute("select status, count(*) from public.places group by status order by status")
            totals = dict(cur.fetchall())

        print(f"{len(rows):,} places in the file · {new:,} new · {len(rows) - new:,} updated · {retired:,} retired")
        print("  in the database now: " + " · ".join(f"{k} {v:,}" for k, v in totals.items()))
        if args.dry_run:
            conn.rollback()
            print("Dry run: rolled back, nothing changed.")
        else:
            conn.commit()
            print("Loaded.")


if __name__ == "__main__":
    main()
