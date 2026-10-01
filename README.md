# Thoq

Letterboxd for cafés and restaurants, starting in Riyadh. You log where you went, Thoq asks a few quick “which was better?” questions to turn that into a score, and uses everyone’s scores to pick where you should go next.

This is the MVP: an Expo (React Native) app that runs on iOS, Android and web, with all data stored on the device. The places and community are **fictional demo data**, there to exercise the recommender until there is a backend.

New to the codebase? Read **[docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md)**: a guided tour of every file, the ranking and recommendation maths, and how data flows through the app.

## Run it

```bash
npm install
npm start          # Expo dev server — press i / a / w
npm test           # recommender, ranking, reducer and geo tests (vitest)
npm run typecheck
npm run lint
npm run build:web  # static web build in dist/
```

## What’s in the MVP

| Flow | Where |
| --- | --- |
| Onboarding: phone sign-in (email as an alternative), name, location (GPS, or a neighbourhood as fallback), taste (yes / not for me), budget, and any number of places you’ve been | `src/app/onboarding.tsx` |
| **For you**: picks for Now (open, or opening within 90 min), Tonight or a chosen hour; Coffee/Food as optional filters; the top pick on a sand panel with its reasons; a prompt to rank places you haven’t ranked yet | `src/app/(tabs)/index.tsx` |
| **Log**: numbered steps, a calendar that opens on today, then “Which would you rather go back to?” comparisons (max 4, with “Not comparable”) | `src/app/(tabs)/log.tsx`, `src/app/compare.tsx` |
| Place page: community average, your score, rating spread, what people order, visits, similar places | `src/app/place/[id].tsx` |
| **Feed**: For you / Following. People-first review posts, plus split decisions, people with similar taste and community lists mixed in | `src/app/(tabs)/feed.tsx` |
| Profiles: “Similar taste” label and where you differ | `src/app/user/[id].tsx` |
| **Profile**: stats, taste profile, rankings (and places not ranked yet), lists, diary | `src/app/(tabs)/profile.tsx` |
| Lists: add places from inside the list, with “Suggested for this list” | `src/app/list/*`, `src/app/save/[id].tsx` |

Only real ratings are shown: the community average and your own scores. Predictions and match scores drive the order but stay out of the UI.

## How scoring works

Star ratings drift towards 4/5 and stop meaning anything. Thoq doesn’t ask for a number.

1. You pick a reaction: **Loved it** (6.7–10), **It was fine** (3.4–6.7) or **Didn’t like it** (0–3.4).
2. Thoq runs a binary search over your ranked places in that band: “Which would you rather go back to?” At most ⌈log₂(n+1)⌉ questions, capped at 4. “Not comparable” swaps in a different place.
3. Your score is read off the position. Cafés and restaurants are ranked separately; comparing a flat white to a mandi isn’t useful.

`src/reco/ranking.ts` (tests: `ranking.test.ts`)

## How recommendations work

`src/reco/engine.ts` blends three estimates of “what would you score this?” into a predicted score on the same 0–10 scale:

- **Taste**: cosine similarity between your tag weights and the place’s tags. Weights start from onboarding; every place you rank above 5 pulls its tags up, below 5 pulls them down.
- **Similar people**: user-user collaborative filtering. Your agreement with someone is 1 − mean|Δ|/5 on places you both ranked, shrunk when you share few places. Their scores, centred on their own average, predict yours.
- **Crowd**: the community average with Bayesian shrinkage (prior weight 5), so one 10/10 can’t beat forty 8.5s.

Distance (exponential decay, 4 km scale) and want-to-go then adjust the **order**, not the prediction. A maximal-marginal-relevance pass stops the list from being six near-identical espresso bars. Every signal that moves a place up also becomes a sentence the user reads (“Nora (78% taste match) scored it 9.1”).

Cold start is handled by onboarding: taste answers plus places you’ve been. Those start unranked with a provisional mid-band score the recommender learns from, and get ranked later in batches of three.

## Project layout

```
src/
  app/        routes (Expo Router). Screens only; no business logic.
  domain/     types, vocabulary (tags, areas), seed data, geo/time helpers
  reco/       ranking + recommender. Pure TypeScript, no React, fully tested
  store/      reducer (pure, tested) + React provider with AsyncStorage persistence
  theme/      design tokens
  ui/         primitives and the shared place row
```

`reco/` and `store/state.ts` have no React or storage imports, so they can move to a server unchanged.

## Known limits and next steps

In order of what I’d do next:

1. **Backend.** Postgres + PostGIS (for “near me” queries) behind auth; Supabase is the fastest route. Move `recommend()` server-side once the community is larger than a few thousand scores. Persisted state is versioned (`STATE_VERSION`), so a migration path exists.
2. **Real places data.** Audit tooling is in [`data-tools/`](data-tools/README.md). Don’t scrape or bulk-store Google Places: its terms restrict storing anything beyond place IDs. Start from Foursquare’s open places dataset or OpenStreetMap, add user submissions and an owner-claim flow.
3. **Sign-in backend.** The phone/email code screen is a prototype; no SMS or email is sent yet.
4. **Arabic UI.** Place names already carry Arabic; the interface is English-only. Full RTL needs Arabic strings, `I18nManager`, and an Arabic companion typeface (IBM Plex Sans Arabic pairs with the current type).
5. **Moderation** of notes and lists before anything is public.
6. **Recommender evaluation.** Once real data exists, hold out each user’s latest visits and measure hit rate / NDCG before changing weights. The weights in `engine.ts` are reasoned defaults, not tuned values.

Times are Riyadh time (UTC+3, no DST) regardless of the device’s time zone.
