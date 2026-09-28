import { describe, expect, it } from 'vitest';

import { buildCommunity } from '../domain/seed-community';
import { PLACES, PLACE_BY_ID } from '../domain/seed-places';
import { areaByName } from '../domain/vocabulary';
import { scoresOf } from './ranking';
import { agreement, crowdStats, recommend, tasteFit, tasteMatch, type Context, type Me, type Neighbour } from './engine';

const origin = { ...areaByName('Al Olaya'), name: 'Al Olaya' };
const ctx = (over: Partial<Context> = {}): Context => ({
  kind: 'any',
  origin,
  nowMinutes: 20 * 60,
  openNow: false,
  maxPrice: null,
  maxKm: null,
  ...over,
});

const community = buildCommunity(new Date('2026-09-28T12:00:00Z'));
const neighbours: Neighbour[] = community.users.map((u) => ({
  userId: u.id,
  name: u.name,
  scores: { ...scoresOf(community.rankings[u.id].cafe), ...scoresOf(community.rankings[u.id].restaurant) },
}));

const blank: Me = { prefs: {}, scores: {}, wantToGo: [] };

describe('agreement / tasteMatch', () => {
  it('is 1-ish for identical scores and shrinks with little overlap', () => {
    const a = { x: 8, y: 6, z: 3 };
    expect(agreement(a, a).sim).toBeCloseTo(3 / 5);
    expect(agreement({ x: 8 }, { x: 8 }).sim).toBeCloseTo(1 / 3);
  });

  it('is negative for opposite scores', () => {
    expect(agreement({ x: 10, y: 0 }, { x: 0, y: 10 }).sim).toBeLessThan(0);
  });

  it('refuses to show a match on fewer than two shared places', () => {
    expect(tasteMatch({ x: 9 }, { x: 9 })).toBeNull();
    expect(tasteMatch({ x: 9, y: 2 }, { x: 9, y: 2 })!.percent).toBe(75);
  });
});

describe('crowdStats', () => {
  it('shrinks a single perfect score towards the global mean', () => {
    const s = crowdStats([{ a: 10 }], 'a', 6);
    expect(s.avg).toBe(10);
    expect(s.shrunk).toBeCloseTo((5 * 6 + 10) / 6);
  });
});

describe('recommend', () => {
  it('respects hard filters', () => {
    const recs = recommend(PLACES, blank, neighbours, ctx({ kind: 'cafe', maxPrice: 1, openNow: true, nowMinutes: 23 * 60 + 30 }));
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.place.kind).toBe('cafe');
      expect(r.place.price).toBeLessThanOrEqual(1);
    }
  });

  it('excludes places the user already ranked unless asked', () => {
    const me: Me = { ...blank, scores: { nabta: 9 } };
    expect(recommend(PLACES, me, neighbours, ctx()).some((r) => r.place.id === 'nabta')).toBe(false);
    expect(recommend(PLACES, me, neighbours, ctx({ includeVisited: true }), 100).some((r) => r.place.id === 'nabta')).toBe(true);
  });

  it('cold start: onboarding preferences alone steer the list', () => {
    const filterFan: Me = { ...blank, prefs: { 'pour-over': 1, 'light-roast': 1, quiet: 1 } };
    const top = recommend(PLACES, filterFan, neighbours, ctx({ kind: 'cafe' }), 5);
    expect(top.filter((r) => r.place.tags.includes('pour-over')).length).toBeGreaterThanOrEqual(3);
  });

  it('users who agree with Nora get places Nora loves', () => {
    const nora = neighbours.find((n) => n.userId === 'u-nora')!;
    // Copy half of Nora's scores; the other half should surface.
    const entries = Object.entries(nora.scores).sort((a, b) => b[1] - a[1]);
    const known = Object.fromEntries(entries.filter((_, i) => i % 2 === 0));
    const hidden = entries.filter((_, i) => i % 2 === 1 && _[1] >= 7).map(([id]) => id);
    const recs = recommend(PLACES, { ...blank, scores: known }, neighbours, ctx(), 10);
    const hits = recs.filter((r) => hidden.includes(r.place.id)).length;
    expect(hidden.length).toBeGreaterThan(0);
    expect(hits / hidden.length).toBeGreaterThanOrEqual(0.5);
  });

  it('predicted scores stay on the 0–10 scale and every pick explains itself', () => {
    const recs = recommend(PLACES, { ...blank, prefs: { burgers: 1, late: 1 } }, neighbours, ctx(), 50);
    for (const r of recs) {
      expect(r.predicted).toBeGreaterThanOrEqual(0);
      expect(r.predicted).toBeLessThanOrEqual(10);
      expect(r.reasons.length).toBeGreaterThan(0);
    }
  });

  it('diversifies: the top five are not all the same kind of place', () => {
    const recs = recommend(PLACES, { ...blank, prefs: { espresso: 1 } }, neighbours, ctx({ kind: 'cafe' }), 5);
    const categories = new Set(recs.map((r) => r.place.category));
    expect(categories.size).toBeGreaterThanOrEqual(3);
  });

  it('low scores lower the prediction for similar places', () => {
    const predictedFor = (me: Me, id: string) =>
      recommend(PLACES, me, [], ctx({ kind: 'cafe' }), 100).find((r) => r.place.id === id)!.predicted;
    // Both disliked places are espresso bars; Mirkaz is another one.
    const hater: Me = { ...blank, scores: { 'bunn-station': 0.5, kiln: 1 } };
    expect(predictedFor(hater, 'mirkaz')).toBeLessThan(predictedFor(blank, 'mirkaz'));
    expect(tasteFit({ espresso: -1 }, PLACE_BY_ID.mirkaz)).toBeLessThan(0);
  });
});

describe('seed community', () => {
  it('is deterministic', () => {
    const again = buildCommunity(new Date('2026-09-28T12:00:00Z'));
    expect(again.visits).toEqual(community.visits);
  });

  it('every visit points to a real place and ranking', () => {
    for (const v of community.visits) {
      expect(PLACE_BY_ID[v.placeId]).toBeDefined();
      const kind = PLACE_BY_ID[v.placeId].kind;
      expect(community.rankings[v.userId][kind].some((e) => e.placeId === v.placeId)).toBe(true);
    }
  });
});
