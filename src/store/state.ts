import type { Kind, PlaceList, PriceLevel, Reaction, Visit } from '../domain/types';
import { PLACE_BY_ID } from '../domain/seed-places';
import { answer, BANDS, finish, isDone, startSession, type Answer, type RankEntry, type Session } from '../reco/ranking';

/** Pure state + reducer. No React, no storage — so it can be tested and moved to a server later. */

export const ME = 'me';
/** Bump when the stored shape changes; older stored state is discarded. */
export const STATE_VERSION = 2;

/** Phone is the default sign-in; email is the quieter alternative. */
export type Account = { method: 'phone' | 'email'; value: string };

export type Me = { name: string; handle: string; account: Account | null };

/** Where distance is measured from: the device location, or a neighbourhood the user picked. */
export type Origin = { lat: number; lng: number; label: string; source: 'gps' | 'area' };

export type State = {
  version: number;
  onboarded: boolean;
  me: Me;
  origin: Origin;
  prefs: Record<string, number>;
  maxPrice: PriceLevel | null;
  rankings: Record<Kind, RankEntry[]>;
  /** Places the user has been to but hasn't placed in their rankings yet (from onboarding). */
  unranked: RankEntry[];
  visits: Visit[];
  wantToGo: string[];
  lists: PlaceList[];
  following: string[];
  /** A place waiting for its comparisons to finish. `visit` is null when ranking an unranked place. */
  pending: { placeId: string; reaction: Reaction; visit: Visit | null; session: Session } | null;
};

export const DEFAULT_ORIGIN: Origin = { lat: 24.6937, lng: 46.6853, label: 'Al Olaya', source: 'area' };

export const initialState: State = {
  version: STATE_VERSION,
  onboarded: false,
  me: { name: '', handle: '', account: null },
  origin: DEFAULT_ORIGIN,
  prefs: {},
  maxPrice: null,
  rankings: { cafe: [], restaurant: [] },
  unranked: [],
  visits: [],
  wantToGo: [],
  lists: [],
  following: [],
  pending: null,
};

export type Action =
  | { type: 'hydrate'; state: State }
  | {
      type: 'onboard';
      me: Me;
      origin: Origin;
      prefs: Record<string, number>;
      maxPrice: PriceLevel | null;
      been: RankEntry[];
    }
  | { type: 'log'; visit: Omit<Visit, 'id' | 'userId'> }
  | { type: 'rankNext' }
  | { type: 'answer'; answer: Answer }
  | { type: 'cancelPending' }
  | { type: 'toggleWant'; placeId: string }
  | { type: 'createList'; id: string; title: string; description: string; placeIds: string[] }
  | { type: 'toggleInList'; listId: string; placeId: string }
  | { type: 'deleteList'; listId: string }
  | { type: 'toggleFollow'; userId: string }
  | { type: 'setOrigin'; origin: Origin }
  | { type: 'setPrefs'; prefs: Record<string, number>; maxPrice: PriceLevel | null }
  | { type: 'reset' };

function kindOf(placeId: string): Kind {
  return PLACE_BY_ID[placeId]?.kind ?? 'cafe';
}

function commit(state: State, pending: NonNullable<State['pending']>, session: Session): State {
  const kind = kindOf(pending.placeId);
  return {
    ...state,
    rankings: { ...state.rankings, [kind]: finish(state.rankings[kind], session) },
    unranked: state.unranked.filter((e) => e.placeId !== pending.placeId),
    visits: pending.visit ? [pending.visit, ...state.visits] : state.visits,
    wantToGo: state.wantToGo.filter((id) => id !== pending.placeId),
    pending: null,
  };
}

/** Start comparing a place against the user's rankings, committing at once if there's nothing to compare. */
function begin(state: State, placeId: string, reaction: Reaction, visit: Visit | null): State {
  const session = startSession(state.rankings[kindOf(placeId)], placeId, reaction);
  const pending = { placeId, reaction, visit, session };
  return isDone(session) ? commit(state, pending, session) : { ...state, pending };
}

let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate':
      return action.state;

    case 'onboard': {
      // Places picked during onboarding are "been there, not ranked yet". They inform taste straight
      // away; the user ranks them later in short batches instead of ordering a long list up front.
      const seen = new Set<string>();
      const unranked = action.been.filter((e) => PLACE_BY_ID[e.placeId] && !seen.has(e.placeId) && seen.add(e.placeId));
      return {
        ...state,
        onboarded: true,
        me: action.me,
        origin: action.origin,
        prefs: action.prefs,
        maxPrice: action.maxPrice,
        rankings: { cafe: [], restaurant: [] },
        unranked,
        visits: [],
      };
    }

    case 'log': {
      const visit: Visit = { ...action.visit, id: newId('v'), userId: ME };
      return begin(state, visit.placeId, visit.reaction, visit);
    }

    case 'rankNext': {
      const next = state.unranked[0];
      return next ? begin(state, next.placeId, next.reaction, null) : state;
    }

    case 'answer': {
      if (!state.pending) return state;
      const session = answer(state.pending.session, action.answer);
      if (isDone(session)) return commit(state, state.pending, session);
      return { ...state, pending: { ...state.pending, session } };
    }

    case 'cancelPending':
      return { ...state, pending: null };

    case 'toggleWant':
      return {
        ...state,
        wantToGo: state.wantToGo.includes(action.placeId)
          ? state.wantToGo.filter((id) => id !== action.placeId)
          : [action.placeId, ...state.wantToGo],
      };

    case 'createList':
      return {
        ...state,
        lists: [{ id: action.id, ownerId: ME, title: action.title, description: action.description, placeIds: action.placeIds }, ...state.lists],
      };

    case 'toggleInList':
      return {
        ...state,
        lists: state.lists.map((l) =>
          l.id !== action.listId
            ? l
            : { ...l, placeIds: l.placeIds.includes(action.placeId) ? l.placeIds.filter((id) => id !== action.placeId) : [...l.placeIds, action.placeId] },
        ),
      };

    case 'deleteList':
      return { ...state, lists: state.lists.filter((l) => l.id !== action.listId) };

    case 'toggleFollow':
      return {
        ...state,
        following: state.following.includes(action.userId)
          ? state.following.filter((id) => id !== action.userId)
          : [...state.following, action.userId],
      };

    case 'setOrigin':
      return { ...state, origin: action.origin };

    case 'setPrefs':
      return { ...state, prefs: action.prefs, maxPrice: action.maxPrice };

    case 'reset':
      return initialState;
  }
}

/**
 * Scores the recommender can learn from: real rankings plus a provisional mid-band score for
 * places the user has been to but not ranked yet. Never shown to the user as a number.
 */
export function learningScores(state: Pick<State, 'unranked'>, ranked: Record<string, number>): Record<string, number> {
  const out = { ...ranked };
  for (const e of state.unranked) {
    if (!(e.placeId in out)) out[e.placeId] = (BANDS[e.reaction].lo + BANDS[e.reaction].hi) / 2;
  }
  return out;
}

/** Accept only state this version understands; anything else starts fresh. */
export function parseStored(raw: string | null): State | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<State>;
    if (parsed.version !== STATE_VERSION) return null;
    return { ...initialState, ...parsed, pending: null } as State;
  } catch {
    return null;
  }
}

export function reactionLabel(r: Reaction): string {
  return r === 'loved' ? 'Loved it' : r === 'fine' ? 'It was fine' : 'Didn’t like it';
}

export { newId };
