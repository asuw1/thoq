import { distanceKm, minutesUntilOpen } from '../domain/geo';
import type { Kind, Place, PriceLevel } from '../domain/types';
import { TAG_LABEL } from '../domain/vocabulary';

/**
 * Thoq recommender, v0.
 *
 * Deliberately transparent: every number that moves a place up the list is
 * also turned into a sentence the user can read. Four signals:
 *
 *  1. Taste   — cosine between the user's tag weights and the place's tags.
 *               Weights start from onboarding and are rewritten by every score.
 *  2. Similar — user-user collaborative filtering. Neighbours are people whose
 *               scores agree with yours on places you both ranked.
 *  3. Crowd   — Bayesian-shrunk community average, so one 10/10 can't
 *               outrank forty 8.5s.
 *  4. Nearby  — distance decay from the chosen area.
 *
 * Signals 1–3 combine into a predicted score on the same 0–10 scale users
 * rank on; distance and want-to-go adjust the order, not the prediction.
 */

export type ScoreMap = Record<string, number>; // placeId -> 0..10

export type Neighbour = { userId: string; name: string; scores: ScoreMap };

export type Me = {
  /** Explicit onboarding answers: tag -> weight in [-1, 1]. */
  prefs: Record<string, number>;
  scores: ScoreMap;
  wantToGo: string[];
};

export type Context = {
  kind: Kind | 'any';
  origin: { lat: number; lng: number; name: string };
  /** Show places open at this time (minutes after midnight, Riyadh), or null for any time. */
  openAt: number | null;
  /** Also include places opening within this many minutes of `openAt`. */
  openingSoonMin?: number;
  maxPrice: PriceLevel | null;
  maxKm: number | null;
  includeVisited?: boolean;
};

export type Rec = {
  place: Place;
  predicted: number;
  rankValue: number;
  km: number;
  /** Minutes until it opens at `openAt`; 0 when already open. */
  opensIn: number;
  reasons: string[];
  parts: { taste: number; similar: number | null; crowd: number };
};

/* ---------------- Taste ---------------- */

const OWN_SCORE_WEIGHT = 0.6;

/** Tag weights from onboarding, rewritten by what the user actually scored. */
export function tasteVector(me: Pick<Me, 'prefs' | 'scores'>, places: Record<string, Place>): Record<string, number> {
  const v: Record<string, number> = { ...me.prefs };
  for (const [placeId, score] of Object.entries(me.scores)) {
    const place = places[placeId];
    if (!place) continue;
    const w = ((score - 5) / 5) * OWN_SCORE_WEIGHT; // 10 → +0.6, 0 → -0.6
    for (const t of place.tags) v[t] = (v[t] ?? 0) + w;
  }
  return v;
}

/** Cosine similarity in [-1, 1] between the user's weights and a place's binary tag vector. */
export function tasteFit(v: Record<string, number>, place: Place): number {
  const norm = Math.sqrt(Object.values(v).reduce((s, x) => s + x * x, 0));
  if (norm === 0 || place.tags.length === 0) return 0;
  const dot = place.tags.reduce((s, t) => s + (v[t] ?? 0), 0);
  return dot / (norm * Math.sqrt(place.tags.length));
}

/* ---------------- Similar people ---------------- */

/**
 * Agreement between two users on places both ranked, in [-1, 1].
 * 1 − mean|Δ|/5, shrunk towards 0 when there is little overlap.
 */
export function agreement(a: ScoreMap, b: ScoreMap): { sim: number; overlap: number } {
  let sum = 0;
  let n = 0;
  for (const id of Object.keys(a)) {
    if (id in b) {
      sum += Math.abs(a[id] - b[id]);
      n++;
    }
  }
  if (n === 0) return { sim: 0, overlap: 0 };
  const raw = 1 - sum / n / 5;
  return { sim: raw * (n / (n + 2)), overlap: n };
}

/** Taste match shown on profiles, 0–100. Needs at least two places in common. */
export function tasteMatch(a: ScoreMap, b: ScoreMap): { percent: number; overlap: number } | null {
  const { sim, overlap } = agreement(a, b);
  if (overlap < 2) return null;
  return { percent: Math.round(50 + 50 * sim), overlap };
}

/** What the UI says about another person's taste. The number itself stays in the backend. */
export function tasteLabel(match: { percent: number } | null): string | null {
  if (!match) return null;
  if (match.percent >= 80) return 'Very similar taste';
  if (match.percent >= 70) return 'Similar taste';
  return null;
}

const mean = (m: ScoreMap) => {
  const xs = Object.values(m);
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 5;
};

type SimilarPrediction = { value: number; confidence: number; voice: { name: string; percent: number; score: number } | null };

function predictFromNeighbours(me: ScoreMap, neighbours: { n: Neighbour; sim: number; mean: number }[], placeId: string): SimilarPrediction | null {
  let num = 0;
  let den = 0;
  let voice: SimilarPrediction['voice'] = null;
  let voiceSim = -Infinity;
  for (const { n, sim, mean: m } of neighbours) {
    const s = n.scores[placeId];
    if (s === undefined) continue;
    num += sim * (s - m);
    den += sim;
    if (s >= 7.5 && sim > voiceSim) {
      voiceSim = sim;
      voice = { name: n.name, percent: Math.round(50 + 50 * sim), score: s };
    }
  }
  if (den < 0.25) return null;
  const value = clamp(mean(me) + num / den, 0, 10);
  return { value, confidence: Math.min(1, den / 1.5), voice };
}

/* ---------------- Crowd ---------------- */

const PRIOR_WEIGHT = 5;

export type CrowdStats = { avg: number; count: number; shrunk: number };

export function crowdStats(everyone: ScoreMap[], placeId: string, globalMean: number): CrowdStats {
  let sum = 0;
  let count = 0;
  for (const m of everyone) {
    const s = m[placeId];
    if (s !== undefined) {
      sum += s;
      count++;
    }
  }
  const avg = count ? sum / count : 0;
  const shrunk = (PRIOR_WEIGHT * globalMean + sum) / (PRIOR_WEIGHT + count);
  return { avg, count, shrunk };
}

/* ---------------- Blend ---------------- */

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round1 = (x: number) => Math.round(x * 10) / 10;

const DISTANCE_SCALE_KM = 4;
const DISTANCE_WEIGHT = 1.2; // a place next door gains up to ~1.2 points of rank
const WANT_TO_GO_BONUS = 0.4;
const DIVERSITY_PENALTY = 1.0;

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const inter = b.filter((t) => sa.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

export function recommend(
  places: Place[],
  me: Me,
  community: Neighbour[],
  ctx: Context,
  limit = 20,
): Rec[] {
  const byId = Object.fromEntries(places.map((p) => [p.id, p]));
  const v = tasteVector(me, byId);
  const tasteNorm = Math.sqrt(Object.values(v).reduce((s, x) => s + x * x, 0));

  const allMaps = [...community.map((c) => c.scores), me.scores];
  const allScores = allMaps.flatMap((m) => Object.values(m));
  const globalMean = allScores.length ? allScores.reduce((s, x) => s + x, 0) / allScores.length : 6;

  const neighbours = community
    .map((n) => ({ n, sim: agreement(me.scores, n.scores).sim, mean: mean(n.scores) }))
    .filter((x) => x.sim > 0.15);

  const want = new Set(me.wantToGo);

  const candidates: Rec[] = [];
  for (const place of places) {
    if (ctx.kind !== 'any' && place.kind !== ctx.kind) continue;
    if (!ctx.includeVisited && place.id in me.scores) continue;
    const opensIn = ctx.openAt === null ? 0 : minutesUntilOpen(place.hours, ctx.openAt);
    if (ctx.openAt !== null && opensIn > (ctx.openingSoonMin ?? 0)) continue;
    if (ctx.maxPrice !== null && place.price > ctx.maxPrice) continue;
    const km = distanceKm(ctx.origin, place);
    if (ctx.maxKm !== null && km > ctx.maxKm) continue;

    const taste = tasteFit(v, place);
    const crowd = crowdStats(allMaps, place.id, globalMean);
    const similar = predictFromNeighbours(me.scores, neighbours, place.id);

    // Weighted mean of three estimates of "what would I score this?"
    const tasteEstimate = 5.5 + 4 * taste;
    const tasteWeight = tasteNorm > 0 ? 1 : 0.2;
    const simWeight = similar ? 2 * similar.confidence : 0;
    const crowdWeight = 0.8;
    const predicted =
      (tasteEstimate * tasteWeight + (similar?.value ?? 0) * simWeight + crowd.shrunk * crowdWeight) /
      (tasteWeight + simWeight + crowdWeight);

    const nearness = Math.exp(-km / DISTANCE_SCALE_KM);
    const rankValue = predicted + DISTANCE_WEIGHT * nearness + (want.has(place.id) ? WANT_TO_GO_BONUS : 0);

    candidates.push({
      place,
      predicted: round1(clamp(predicted, 0, 10)),
      rankValue,
      km,
      opensIn,
      reasons: explain({ place, v, taste, similar, crowd, km, origin: ctx.origin.name, want: want.has(place.id) }),
      parts: { taste, similar: similar ? similar.value : null, crowd: crowd.shrunk },
    });
  }

  // Maximal marginal relevance: avoid a list of six near-identical espresso bars.
  const picked: Rec[] = [];
  const pool = [...candidates];
  while (picked.length < limit && pool.length) {
    let best = 0;
    let bestVal = -Infinity;
    pool.forEach((c, i) => {
      const overlap = picked.reduce((mx, p) => Math.max(mx, jaccard(c.place.tags, p.place.tags)), 0);
      const val = c.rankValue - DIVERSITY_PENALTY * overlap;
      if (val > bestVal) {
        bestVal = val;
        best = i;
      }
    });
    picked.push(pool.splice(best, 1)[0]);
  }
  return picked;
}

/* ---------------- Reasons ---------------- */

function explain(x: {
  place: Place;
  v: Record<string, number>;
  taste: number;
  similar: SimilarPrediction | null;
  crowd: CrowdStats;
  km: number;
  origin: string;
  want: boolean;
}): string[] {
  const out: string[] = [];
  if (x.want) out.push('On your want-to-go list');
  if (x.similar?.voice) {
    const { name, percent, score } = x.similar.voice;
    out.push(`${name}${percent >= 70 ? ', whose taste is close to yours,' : ''} scored it ${score.toFixed(1)}`);
  }
  const liked = x.place.tags
    .filter((t) => (x.v[t] ?? 0) > 0.2)
    .sort((a, b) => (x.v[b] ?? 0) - (x.v[a] ?? 0))
    .slice(0, 2)
    .map((t) => TAG_LABEL[t]?.toLowerCase() ?? t);
  if (liked.length && x.taste > 0.15) out.push(`Fits what you rank highly: ${liked.join(', ')}`);
  if (x.crowd.count >= 3) out.push(`${x.crowd.avg.toFixed(1)} average from ${x.crowd.count} people`);
  out.push(`${x.km < 1 ? 'Under 1' : x.km.toFixed(1)} km from ${x.origin}`);
  return out;
}

/* ---------------- Related places ---------------- */

export function similarPlaces(place: Place, places: Place[], limit = 4): Place[] {
  return places
    .filter((p) => p.id !== place.id && p.kind === place.kind)
    .map((p) => ({ p, s: jaccard(place.tags, p.tags) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.p);
}

/** "Suggested for this list": places sharing the most tags with what's already in it, best rated first on ties. */
export function suggestForList(placeIds: string[], places: Place[], crowd: Record<string, { avg: number }>, limit = 5): Place[] {
  const inList = places.filter((p) => placeIds.includes(p.id));
  if (!inList.length) return [];
  return places
    .filter((p) => !placeIds.includes(p.id))
    .map((p) => ({ p, s: inList.reduce((sum, q) => sum + jaccard(p.tags, q.tags), 0) / inList.length }))
    .filter((x) => x.s > 0.15)
    .sort((a, b) => b.s - a.s || (crowd[b.p.id]?.avg ?? 0) - (crowd[a.p.id]?.avg ?? 0))
    .slice(0, limit)
    .map((x) => x.p);
}
