import { describe, expect, it } from 'vitest';

import { scoresOf } from '../reco/ranking';
import { DEFAULT_ORIGIN, initialState, learningScores, parseStored, reducer, STATE_VERSION, type State } from './state';

const onboarded = reducer(initialState, {
  type: 'onboard',
  me: { name: 'Test', handle: 'test', account: { method: 'phone', value: '+966500000000' } },
  origin: DEFAULT_ORIGIN,
  prefs: { 'pour-over': 1 },
  maxPrice: 2,
  been: [
    { placeId: 'nabta', reaction: 'loved' },
    { placeId: 'kiln', reaction: 'fine' },
    { placeId: 'najd-table', reaction: 'loved' },
    { placeId: 'nabta', reaction: 'loved' }, // duplicate ignored
  ],
});

const log = (s: State, placeId: string, reaction: 'loved' | 'fine' | 'disliked') =>
  reducer(s, { type: 'log', visit: { placeId, reaction, date: '2026-09-28', ordered: [], note: '' } });

const rankAll = (s: State) => {
  let out = s;
  while (out.unranked.length || out.pending) {
    out = out.pending ? reducer(out, { type: 'answer', answer: 'existing' }) : reducer(out, { type: 'rankNext' });
  }
  return out;
};

describe('reducer', () => {
  it('onboarding stores places as unranked, without inventing visits', () => {
    expect(onboarded.unranked.map((e) => e.placeId)).toEqual(['nabta', 'kiln', 'najd-table']);
    expect(onboarded.rankings).toEqual({ cafe: [], restaurant: [] });
    expect(onboarded.visits).toHaveLength(0);
  });

  it('unranked places still teach the recommender, at a provisional mid-band score', () => {
    const s = learningScores(onboarded, {});
    expect(s.nabta).toBeCloseTo(8.35);
    expect(s.kiln).toBeCloseTo(5.05);
  });

  it('ranking unranked places moves them into rankings one at a time', () => {
    let s = reducer(onboarded, { type: 'rankNext' });
    expect(s.pending).toBeNull(); // empty band: nabta commits immediately
    expect(s.rankings.cafe.map((e) => e.placeId)).toEqual(['nabta']);
    s = rankAll(s);
    expect(s.unranked).toHaveLength(0);
    expect(s.rankings.cafe.map((e) => e.placeId)).toEqual(['nabta', 'kiln']);
    expect(s.rankings.restaurant.map((e) => e.placeId)).toEqual(['najd-table']);
    expect(s.visits).toHaveLength(0);
  });

  it('holds a visit until comparisons finish, then commits it', () => {
    let s = log(rankAll(onboarded), 'ghaf', 'loved');
    expect(s.pending).not.toBeNull();
    while (s.pending) s = reducer(s, { type: 'answer', answer: 'new' });
    expect(s.rankings.cafe[0].placeId).toBe('ghaf');
    expect(s.visits[0].placeId).toBe('ghaf');
    expect(scoresOf(s.rankings.cafe).ghaf).toBe(10);
  });

  it('logging an unranked place ranks it and removes it from unranked', () => {
    const s = log(onboarded, 'kiln', 'fine');
    expect(s.pending).toBeNull();
    expect(s.unranked.map((e) => e.placeId)).not.toContain('kiln');
    expect(s.rankings.cafe.map((e) => e.placeId)).toEqual(['kiln']);
  });

  it('cancelling discards the pending visit', () => {
    const ranked = rankAll(onboarded);
    const s = reducer(log(ranked, 'ghaf', 'loved'), { type: 'cancelPending' });
    expect(s.pending).toBeNull();
    expect(s.visits).toHaveLength(0);
    expect(s.rankings).toEqual(ranked.rankings);
  });

  it('logging a want-to-go place removes it from the list', () => {
    let s = reducer(onboarded, { type: 'toggleWant', placeId: 'lail' });
    expect(s.wantToGo).toEqual(['lail']);
    s = log(s, 'lail', 'fine');
    expect(s.wantToGo).toEqual([]);
  });

  it('lists toggle membership', () => {
    let s = reducer(onboarded, { type: 'createList', id: 'l1', title: 'T', description: '', placeIds: [] });
    s = reducer(s, { type: 'toggleInList', listId: 'l1', placeId: 'nabta' });
    expect(s.lists[0].placeIds).toEqual(['nabta']);
    s = reducer(s, { type: 'toggleInList', listId: 'l1', placeId: 'nabta' });
    expect(s.lists[0].placeIds).toEqual([]);
  });
});

describe('parseStored', () => {
  it('rejects garbage and other versions, drops pending', () => {
    expect(parseStored(null)).toBeNull();
    expect(parseStored('{nope')).toBeNull();
    expect(parseStored(JSON.stringify({ version: STATE_VERSION - 1 }))).toBeNull();
    const pendingState = log(rankAll(onboarded), 'ghaf', 'loved');
    expect(pendingState.pending).not.toBeNull();
    expect(parseStored(JSON.stringify(pendingState))!.pending).toBeNull();
  });
});
