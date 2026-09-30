import { describe, expect, it } from 'vitest';

import {
  answer,
  bandScore,
  finish,
  insertAt,
  isDone,
  MAX_QUESTIONS,
  pivot,
  remainingQuestions,
  scoresOf,
  startSession,
  type RankEntry,
} from './ranking';

const loved = (id: string): RankEntry => ({ placeId: id, reaction: 'loved' });
const fine = (id: string): RankEntry => ({ placeId: id, reaction: 'fine' });
const disliked = (id: string): RankEntry => ({ placeId: id, reaction: 'disliked' });

describe('bandScore', () => {
  it('gives the top of each band its ceiling', () => {
    expect(bandScore('loved', 0, 1)).toBe(10);
    expect(bandScore('fine', 0, 3)).toBe(6.7);
    expect(bandScore('disliked', 0, 2)).toBe(3.4);
  });

  it('steps down evenly and stays inside the band', () => {
    const scores = [0, 1, 2, 3].map((i) => bandScore('loved', i, 4));
    expect(scores).toEqual([10, 9.2, 8.4, 7.5]);
    expect(Math.min(...scores)).toBeGreaterThan(6.7);
  });
});

describe('scoresOf', () => {
  it('scores every entry and keeps bands ordered', () => {
    const s = scoresOf([loved('a'), loved('b'), fine('c'), disliked('d')]);
    expect(s.a).toBeGreaterThan(s.b);
    expect(s.b).toBeGreaterThan(s.c);
    expect(s.c).toBeGreaterThan(s.d);
  });
});

describe('insertAt', () => {
  it('inserts into the right band regardless of input order', () => {
    const out = insertAt([fine('c'), loved('a')], loved('b'), 1);
    expect(out.map((e) => e.placeId)).toEqual(['a', 'b', 'c']);
  });

  it('moves a re-logged place instead of duplicating it', () => {
    const out = insertAt([loved('a'), loved('b'), fine('c')], fine('a'), 0);
    expect(out.map((e) => e.placeId)).toEqual(['b', 'a', 'c']);
    expect(out.filter((e) => e.placeId === 'a')).toHaveLength(1);
  });

  it('clamps out-of-range positions', () => {
    expect(insertAt([loved('a')], loved('b'), 99).map((e) => e.placeId)).toEqual(['a', 'b']);
    expect(insertAt([loved('a')], loved('b'), -3).map((e) => e.placeId)).toEqual(['b', 'a']);
  });
});

describe('comparison session', () => {
  const ranked = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(loved);

  /** Simulate a user whose true order puts `x` at `truePos`. */
  function run(truePos: number) {
    let s = startSession(ranked, 'x', 'loved');
    const truth = [...ranked.map((e) => e.placeId)];
    truth.splice(truePos, 0, 'x');
    while (!isDone(s)) {
      const other = pivot(s)!;
      s = answer(s, truth.indexOf('x') < truth.indexOf(other) ? 'new' : 'existing');
    }
    return { s, order: finish(ranked, s).map((e) => e.placeId), truth };
  }

  it('finds the exact position for every possible true position', () => {
    for (let pos = 0; pos <= ranked.length; pos++) {
      const { order, truth } = run(pos);
      expect(order).toEqual(truth);
    }
  });

  it('asks at most ceil(log2(n+1)) questions', () => {
    for (let pos = 0; pos <= ranked.length; pos++) {
      expect(run(pos).s.asked).toBeLessThanOrEqual(3);
    }
    expect(remainingQuestions(startSession(ranked, 'x', 'loved'))).toBe(3);
  });

  it('settles immediately on a tie, directly below the tied place', () => {
    let s = startSession(ranked, 'x', 'loved');
    const tiedWith = pivot(s)!;
    s = answer(s, 'tie');
    expect(isDone(s)).toBe(true);
    const order = finish(ranked, s).map((e) => e.placeId);
    expect(order.indexOf('x')).toBe(order.indexOf(tiedWith) + 1);
  });

  it('needs no questions for an empty band', () => {
    const s = startSession([fine('z')], 'x', 'loved');
    expect(isDone(s)).toBe(true);
    expect(finish([fine('z')], s).map((e) => e.placeId)).toEqual(['x', 'z']);
  });

  it('stops after MAX_QUESTIONS even in a long band', () => {
    const long = Array.from({ length: 100 }, (_, i) => loved(`p${i}`));
    let s = startSession(long, 'x', 'loved');
    while (!isDone(s)) s = answer(s, 'existing');
    expect(s.asked).toBe(MAX_QUESTIONS);
    expect(finish(long, s).map((e) => e.placeId)).toContain('x');
  });

  it('"not comparable" asks about a different place and never repeats it', () => {
    let s = startSession(ranked, 'x', 'loved');
    const first = pivot(s)!;
    s = answer(s, 'skip');
    expect(isDone(s)).toBe(false);
    expect(pivot(s)).not.toBe(first);
    expect(s.skipped).toEqual([first]);
  });

  it('settles in the middle when everything left is skipped', () => {
    let s = startSession([loved('a')], 'x', 'loved');
    s = answer(s, 'skip');
    expect(isDone(s)).toBe(true);
    expect(finish([loved('a')], s).map((e) => e.placeId)).toEqual(['x', 'a']);
  });

  it('never compares a re-logged place against itself', () => {
    const s = startSession(ranked, 'c', 'loved');
    expect(s.bandIds).not.toContain('c');
  });
});
