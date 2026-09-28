import type { Reaction } from '../domain/types';

/**
 * Scores come from comparisons, not star taps.
 *
 * A user's places of one kind live in a single best-first list, grouped into
 * three contiguous bands by reaction. A new place picks its band from the
 * reaction, then a binary search of head-to-head questions ("which was
 * better?") finds its exact position. The score is read off the position.
 * Five-star ratings drift towards 4s; relative judgements don't.
 */

export type RankEntry = { placeId: string; reaction: Reaction };

export const REACTIONS: Reaction[] = ['loved', 'fine', 'disliked'];

export const BANDS: Record<Reaction, { lo: number; hi: number }> = {
  loved: { lo: 6.7, hi: 10 },
  fine: { lo: 3.4, hi: 6.7 },
  disliked: { lo: 0, hi: 3.4 },
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Top of the band scores its ceiling; each place below steps down evenly. */
export function bandScore(reaction: Reaction, index: number, size: number): number {
  const { lo, hi } = BANDS[reaction];
  return round1(hi - (index * (hi - lo)) / size);
}

export function band(entries: RankEntry[], reaction: Reaction): string[] {
  return entries.filter((e) => e.reaction === reaction).map((e) => e.placeId);
}

/** Every ranked place's score, keyed by place id. */
export function scoresOf(entries: RankEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of REACTIONS) {
    const ids = band(entries, r);
    ids.forEach((id, i) => {
      out[id] = bandScore(r, i, ids.length);
    });
  }
  return out;
}

/** Keep bands contiguous and in loved → fine → disliked order. */
export function normalise(entries: RankEntry[]): RankEntry[] {
  return REACTIONS.flatMap((r) => entries.filter((e) => e.reaction === r));
}

export function insertAt(entries: RankEntry[], entry: RankEntry, bandIndex: number): RankEntry[] {
  const rest = normalise(entries.filter((e) => e.placeId !== entry.placeId));
  const bandIds = band(rest, entry.reaction);
  const clamped = Math.max(0, Math.min(bandIndex, bandIds.length));
  const out: RankEntry[] = [];
  for (const r of REACTIONS) {
    const inBand = rest.filter((e) => e.reaction === r);
    if (r === entry.reaction) inBand.splice(clamped, 0, entry);
    out.push(...inBand);
  }
  return out;
}

/* ---------------- Comparison session ---------------- */

export type Session = {
  placeId: string;
  reaction: Reaction;
  /** Place ids already in the band, best first (never includes placeId). */
  bandIds: string[];
  lo: number;
  hi: number;
  asked: number;
};

export function startSession(entries: RankEntry[], placeId: string, reaction: Reaction): Session {
  const bandIds = band(entries, reaction).filter((id) => id !== placeId);
  return { placeId, reaction, bandIds, lo: 0, hi: bandIds.length, asked: 0 };
}

export function isDone(s: Session): boolean {
  return s.lo >= s.hi;
}

/** The place to compare against next, or null when the position is settled. */
export function pivot(s: Session): string | null {
  return isDone(s) ? null : s.bandIds[Math.floor((s.lo + s.hi) / 2)];
}

/** Upper bound on questions for this session — shown as "about N more". */
export function remainingQuestions(s: Session): number {
  const span = s.hi - s.lo;
  return span <= 0 ? 0 : Math.ceil(Math.log2(span + 1));
}

export type Answer = 'new' | 'existing' | 'tie';

export function answer(s: Session, a: Answer): Session {
  if (isDone(s)) return s;
  const mid = Math.floor((s.lo + s.hi) / 2);
  const asked = s.asked + 1;
  if (a === 'new') return { ...s, hi: mid, asked };
  if (a === 'existing') return { ...s, lo: mid + 1, asked };
  // A tie settles it: sit directly below the place it tied with.
  return { ...s, lo: mid + 1, hi: mid + 1, asked };
}

export function finish(entries: RankEntry[], s: Session): RankEntry[] {
  return insertAt(entries, { placeId: s.placeId, reaction: s.reaction }, s.lo);
}
