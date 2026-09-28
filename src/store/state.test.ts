import { describe, expect, it } from 'vitest';

import { scoresOf } from '../reco/ranking';
import { initialState, parseStored, reducer, STATE_VERSION, type State } from './state';

const onboarded = reducer(initialState, {
  type: 'onboard',
  me: { name: 'Test', handle: 'test', area: 'Al Olaya' },
  prefs: { 'pour-over': 1 },
  maxPrice: 2,
  loved: ['nabta', 'kiln', 'najd-table'],
  today: '2026-09-28',
});

const log = (s: State, placeId: string, reaction: 'loved' | 'fine' | 'disliked') =>
  reducer(s, { type: 'log', visit: { placeId, reaction, date: '2026-09-28', ordered: [], note: '' } });

describe('reducer', () => {
  it('onboarding ranks loved places by kind, in pick order', () => {
    expect(onboarded.rankings.cafe.map((e) => e.placeId)).toEqual(['nabta', 'kiln']);
    expect(onboarded.rankings.restaurant.map((e) => e.placeId)).toEqual(['najd-table']);
    expect(onboarded.visits).toHaveLength(3);
  });

  it('commits immediately when the band is empty', () => {
    const s = log(onboarded, 'lail', 'fine');
    expect(s.pending).toBeNull();
    expect(s.rankings.cafe.map((e) => e.placeId)).toEqual(['nabta', 'kiln', 'lail']);
  });

  it('holds a visit until comparisons finish, then commits it', () => {
    let s = log(onboarded, 'ghaf', 'loved');
    expect(s.pending).not.toBeNull();
    expect(s.visits).toHaveLength(3);
    while (s.pending) s = reducer(s, { type: 'answer', answer: 'new' });
    expect(s.rankings.cafe[0].placeId).toBe('ghaf');
    expect(s.visits[0].placeId).toBe('ghaf');
    expect(scoresOf(s.rankings.cafe).ghaf).toBe(10);
  });

  it('cancelling discards the pending visit', () => {
    const s = reducer(log(onboarded, 'ghaf', 'loved'), { type: 'cancelPending' });
    expect(s.pending).toBeNull();
    expect(s.visits).toHaveLength(3);
    expect(s.rankings).toEqual(onboarded.rankings);
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
    expect(parseStored(JSON.stringify({ version: STATE_VERSION + 1 }))).toBeNull();
    const pendingState = log(onboarded, 'ghaf', 'loved');
    expect(parseStored(JSON.stringify(pendingState))!.pending).toBeNull();
  });
});
