import type { Kind, PlaceList, PriceLevel, Reaction, Visit } from '../domain/types';
import { PLACE_BY_ID } from '../domain/seed-places';
import { answer, finish, insertAt, isDone, startSession, type Answer, type RankEntry, type Session } from '../reco/ranking';

/** Pure state + reducer. No React, no storage — so it can be tested and moved to a server later. */

export const ME = 'me';
export const STATE_VERSION = 1;

export type Me = { name: string; handle: string; area: string };

export type State = {
  version: number;
  onboarded: boolean;
  me: Me;
  prefs: Record<string, number>;
  maxPrice: PriceLevel | null;
  rankings: Record<Kind, RankEntry[]>;
  visits: Visit[];
  wantToGo: string[];
  lists: PlaceList[];
  following: string[];
  /** A visit waiting for its comparisons to finish. */
  pending: { visit: Visit; session: Session } | null;
};

export const initialState: State = {
  version: STATE_VERSION,
  onboarded: false,
  me: { name: '', handle: '', area: 'Al Olaya' },
  prefs: {},
  maxPrice: null,
  rankings: { cafe: [], restaurant: [] },
  visits: [],
  wantToGo: [],
  lists: [],
  following: [],
  pending: null,
};

export type Action =
  | { type: 'hydrate'; state: State }
  | { type: 'onboard'; me: Me; prefs: Record<string, number>; maxPrice: PriceLevel | null; loved: string[]; today: string }
  | { type: 'log'; visit: Omit<Visit, 'id' | 'userId'> }
  | { type: 'answer'; answer: Answer }
  | { type: 'cancelPending' }
  | { type: 'toggleWant'; placeId: string }
  | { type: 'createList'; id: string; title: string; description: string; placeIds: string[] }
  | { type: 'toggleInList'; listId: string; placeId: string }
  | { type: 'deleteList'; listId: string }
  | { type: 'toggleFollow'; userId: string }
  | { type: 'setArea'; area: string }
  | { type: 'setPrefs'; prefs: Record<string, number>; maxPrice: PriceLevel | null }
  | { type: 'reset' };

function kindOf(placeId: string): Kind {
  return PLACE_BY_ID[placeId]?.kind ?? 'cafe';
}

function commit(state: State, visit: Visit, session: Session): State {
  const kind = kindOf(visit.placeId);
  return {
    ...state,
    rankings: { ...state.rankings, [kind]: finish(state.rankings[kind], session) },
    visits: [visit, ...state.visits],
    wantToGo: state.wantToGo.filter((id) => id !== visit.placeId),
    pending: null,
  };
}

let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate':
      return action.state;

    case 'onboard': {
      // Places the user already loves go straight in, in the order they were picked.
      let rankings = { cafe: [] as RankEntry[], restaurant: [] as RankEntry[] };
      const visits: Visit[] = [];
      for (const placeId of action.loved) {
        const kind = kindOf(placeId);
        rankings = { ...rankings, [kind]: insertAt(rankings[kind], { placeId, reaction: 'loved' }, rankings[kind].length) };
        visits.push({ id: newId('v'), userId: ME, placeId, date: action.today, reaction: 'loved', ordered: [], note: '' });
      }
      return { ...state, onboarded: true, me: action.me, prefs: action.prefs, maxPrice: action.maxPrice, rankings, visits };
    }

    case 'log': {
      const visit: Visit = { ...action.visit, id: newId('v'), userId: ME };
      const kind = kindOf(visit.placeId);
      const session = startSession(state.rankings[kind], visit.placeId, visit.reaction);
      if (isDone(session)) return commit(state, visit, session);
      return { ...state, pending: { visit, session } };
    }

    case 'answer': {
      if (!state.pending) return state;
      const session = answer(state.pending.session, action.answer);
      if (isDone(session)) return commit(state, state.pending.visit, session);
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

    case 'setArea':
      return { ...state, me: { ...state.me, area: action.area } };

    case 'setPrefs':
      return { ...state, prefs: action.prefs, maxPrice: action.maxPrice };

    case 'reset':
      return initialState;
  }
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
