# Supabase backend

Thoq's database lives on Supabase: Postgres with PostGIS for "near me", row-level security so people can only change their own data, and phone sign-in.

| File | What it is |
| --- | --- |
| `migrations/20261008000000_init.sql` | The whole schema: tables, security rules, and the functions the app calls. |
| `tests/test_schema.py` | Runs the schema on a throwaway local database and checks it. Never touches the real project. |
| `tests/supabase_stub.sql` | Stand-ins for Supabase's sign-in tables, for those tests only. |
| `../data-tools/load_places.py` | Puts the place catalogue into the database. Safe to re-run. |

## Set it up (once)

### 1. Create the project

1. Make an account at supabase.com and create a project named `thoq`. Region: **Frankfurt (eu-central-1)**.
2. Save the database password in a password manager. It never goes in a file, a commit or a chat.

### 2. Create the tables

1. In the dashboard, open **SQL Editor → New query**.
2. Open `supabase/migrations/20261008000000_init.sql` in a text editor, copy all of it, paste it in, and press **Run**.
3. It should say "Success. No rows returned". Under **Table Editor** you'll now see `places`, `rankings`, `visits` and the rest.

Run it once. Running it a second time fails with "already exists", which is harmless: nothing is changed.

### 3. Load the places

1. In the dashboard, press **Connect** (top of the page), choose **Session pooler**, and copy the URI. It looks like `postgresql://postgres.abcd:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`. Replace `[YOUR-PASSWORD]` with your database password.
   The **direct connection** URI needs IPv6, which most home internet doesn't have. Use the pooler.
2. In PowerShell, from `data-tools`:

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:SUPABASE_DB_URL = "paste the URI here"
python import_places.py         # rebuild the catalogue with the latest blocklist
python load_places.py --dry-run # shows what would change, changes nothing
python load_places.py           # loads
```

`$env:` only lasts until you close that PowerShell window, which is what we want for a password.

Expected output: about 39,000 places, all new. Check it worked: **SQL Editor →** `select * from places_near(24.6937, 46.6853, 2);` lists places around Al Olaya.

### 4. Send me two values

From **Project Settings → API**: the **Project URL** and the **anon public** key. They're designed to be public and go into the app. Never send the **service_role** key or the database password.

## What's in the schema

| Data | Who can read it | Who can change it |
| --- | --- | --- |
| Places, categories | Everyone | Only the loader |
| Profiles, follows, rankings, visits, lists | Signed-in people | The owner |
| Preferences, saved, unranked | Only you | Only you |
| Comparisons, impressions, interactions, reports | Only you | Only you, and only to add (history can't be edited) |

Things worth knowing:

- **Scores aren't stored.** A ranking is an ordered list; the `ranking_scores` view reads each score off its position with the same formula as the app (`bandScore` in `src/reco/ranking.ts`). A test checks they agree to the decimal.
- **Rankings change only through `set_rankings()`**, which replaces your list for cafés or restaurants in one go, so positions can't get gaps or duplicates.
- **Places are never deleted.** A place that leaves the import becomes `retired`; one confirmed closed becomes `closed`. Old rankings still point at something.
- **Impressions and interactions** are for the recommender: what was shown, and what you did with it. That's how it stops repeating places you ignore.
- **`place_categories.source`** separates the import's categories from ones added later by users, owners or a model, so re-importing never overwrites them.

## Running the schema tests (for development)

Needs Postgres 16 with PostGIS that `psql` can reach. Skipped otherwise.

```bash
python -m unittest supabase/tests/test_schema.py
```

## Later

- Once the schema changes after launch, we switch to the Supabase CLI (`supabase db push`) so every change is a new migration file instead of pasted SQL.
- `place_stats` is computed on every request. That's fine for the beta; past a few hundred thousand rankings it becomes a materialised view refreshed every few minutes.
