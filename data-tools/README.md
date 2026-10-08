# Place data audit

Before Thoq picks a source for its place catalogue, we **measure** the candidates on places you actually know, instead of trusting marketing pages.

The scripts in this folder:

| Script | Does |
| --- | --- |
| `fetch_fsq.py` | Pulls every café and restaurant in Riyadh from **Foursquare OS Places** (Apache-2.0, we may store it) into `out/fsq_riyadh.csv`. |
| `fetch_osm.py` | Pulls the same from **OpenStreetMap** (ODbL) into `out/osm_riyadh.csv`. |
| `fetch_gmaps_list.py` | Exports one shared Google Maps list to `out/gmaps_list.csv` in ground-truth format, optionally with a random sample. |
| `merge_truth.py` | Adds an exported list to `ground_truth.csv`: splits mixed Arabic/English names, cleans notes, fills `area`, removes the template rows and skips places you already have. Backs up first. |
| `audit.py` | Compares both with your `ground_truth.csv` and writes `out/report.md`. |
| `import_places.py` | Turns `out/fsq_riyadh.csv` into Thoq's place catalogue in `out/catalogue/`. See [Building the catalogue](#building-the-catalogue). |
| `load_places.py` | Loads `out/catalogue/` into the Supabase database. See [`supabase/README.md`](../supabase/README.md). |
| `test_tools.py` | Offline tests for all of the above. |

`out/` is git-ignored. Fetched data never goes into the repo.

## Run it (Windows, PowerShell)

You need Python 3.10+ (`python --version`). Run everything from this folder:

```powershell
cd C:\Users\abdul\Desktop\thoq\thoq\data-tools
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m unittest test_tools.py      # should print OK
```

### 1. Foursquare

1. Make a free account at huggingface.co. Then go to **Settings → Access Tokens → New token** and choose the **Read** type.
2. Open https://huggingface.co/datasets/foursquare/fsq-os-places while logged in, and accept the terms if the page asks.
3. Run:

```powershell
$env:HF_TOKEN = "hf_your_token_here"
python fetch_fsq.py
```

DuckDB reads only the columns and row groups it needs from the remote Parquet files. Expect a few minutes and a few hundred MB of download. If it fails, the error message says what to check.

### 2. OpenStreetMap

```powershell
python fetch_osm.py
```

This uses the public Overpass API. If it times out, wait a minute and retry; the public server is shared.

### 3. Your ground truth (the important part)

Copy `ground_truth.example.csv` to `ground_truth.csv` and list **30–50 real places you know well**:

- **A real mix:** famous specialty roasteries, small neighbourhood spots, chains (with the branch you know), restaurants across price levels, and both new and old places.
- **5–10 places you know have closed.** These measure how stale each source is.
- **Coordinates where you can.** In Google Maps, long-press the pin and copy the numbers. They let the audit pick the right branch and measure pin accuracy.
- **Arabic names** in `name_ar` where the sign is in Arabic.

Copying coordinates from Google Maps by hand for a private comparison list is fine. What we must not do is bulk-store Google's data in Thoq.

### Using a shared Google Maps list

```powershell
python fetch_gmaps_list.py "https://maps.app.goo.gl/XXXX" --sample 20
```

This writes the whole list to `out/gmaps_list.csv` (plus 20 random places to `out/gmaps_sample.csv` if you want a smaller set).

To add the list to your ground truth:

```powershell
python merge_truth.py --dry-run   # see what will be added and which duplicates are skipped
python merge_truth.py             # do it (your old file is saved as ground_truth.backup.csv)
```

Every merged place starts as `open`. If you know one has closed, change its `status` to `closed`; closed places are the most valuable rows in the audit.

- **If it says it can't find a list id:** open the link in your browser, wait for the list to load, and pass the full address-bar URL instead.
- **If it finds no places:** Google changed the format. Re-run with `--dump raw.json` and send me the file.

### 4. Audit

```powershell
python audit.py
start out\report.md
```

## Building the catalogue

```powershell
python import_places.py
start out\catalogue\summary.md
```

What it does, in order:

1. **Drops** places on `catalogue/blocklist.csv` and places Foursquare marks closed.
2. **Excludes** bars, shisha and lounges by category. One matching label is enough, even if the place is also labelled a café.
3. **Maps** Foursquare labels onto Thoq's categories (`catalogue/categories.csv`). A place can have several: a café that bakes and serves breakfast gets all three. A plain "Restaurant" is kept with no category yet.
4. **Reads the name too.** "مندي" or "كبسة" adds Saudi, which Foursquare's labels almost never say. "شيشة", "معسل", "cigar" or "staff lounge" removes the place.
5. **Merges** duplicates (near-identical names within 50 m).
6. Splits Arabic and English names, cleans the address, and decides **ranked with**: café or restaurant, exactly one.

You edit four files in `catalogue/`, then re-run:

| File | Edit it when |
| --- | --- |
| `categories.csv` | You want to rename, add or remove a Thoq category, or change whether it's ranked with cafés or restaurants. |
| `category_rules.csv` | A Foursquare label lands in the wrong category, or `summary.md` lists a dropped label that belongs in Thoq. The comments at the top explain the syntax. |
| `name_rules.csv` | A word in place names should add a category (a dish, "بروست") or remove the place. Arabic rules also match with ال، و، بال… in front. |
| `blocklist.csv` | One specific place shouldn't be in Thoq. Add its `source_id` (from `review_names.csv` or `places.csv`) and a reason. |

**Check every run:**
- `summary.md`: counts, the labels that got places excluded, and the labels that were dropped.
- `review_names.csv`: places whose *name* says lounge or shisha but whose category is fine (e.g. "Yanni Coffee & Lounge"). These are flagged rather than deleted, because many are ordinary cafés. Block the ones that aren't.

`NOTICE.txt` and `LICENSE.txt` are copied next to the data on every run. They must ship wherever the data goes (the Apache-2.0 licence requires it).

## Reading the report

| Line | What good looks like | Why it matters |
| --- | --- | --- |
| **Open places found** | 85%+ | Below about 70%, users hit "this place isn't on Thoq" constantly, and trust goes. |
| **Median pin error** | Under 50 m | Distance and "near you" depend on it. |
| **Closed places still listed** | Close to 0 | Recommending a closed place is the fastest way to lose a user. |
| **Name contains Arabic** | High | Needed for search and for the Arabic version. |
| **Has opening hours** | Any is a bonus | Foursquare's open dataset has no hours at all; OSM sometimes does. Hours will mostly come from our own users and owners. |
| **Refreshed in the last 12 months** (Foursquare) | High | A rough freshness signal. |
| **Likely duplicate pairs** | Low | Duplicates split ratings across copies of the same place. |

Bring the report back and we'll decide together. The likely outcome is "source X as the starting catalogue, plus Thoq's own corrections layer", but the numbers decide.

## Licences, in one paragraph each

**Foursquare OS Places, Apache-2.0.**
- We can store it, change it and ship it in the app.
- We must keep Foursquare's attribution: their `NOTICE.txt` in any data we redistribute, plus a credit in the app's about screen.

**OpenStreetMap, ODbL.**
- Free to use.
- If we publicly distribute a *database* derived from OSM, that database must be shared under ODbL too.
- A credit ("© OpenStreetMap contributors") is required.
- Fine for checking and enriching data; think hard before making it the core catalogue.

**Google Places.**
- We can't store anything except place IDs. That's why it's not one of the candidates.
