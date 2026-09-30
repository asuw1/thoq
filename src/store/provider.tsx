import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';

import { buildCommunity, type SeedCommunity } from '../domain/seed-community';
import type { Visit } from '../domain/types';
import type { Neighbour, ScoreMap } from '../reco/engine';
import { scoresOf } from '../reco/ranking';
import { initialState, learningScores, ME, parseStored, reducer, type Action, type State } from './state';

const STORAGE_KEY = 'thoq/state';

type Store = {
  state: State;
  dispatch: (a: Action) => void;
  community: SeedCommunity;
  /** My ranked scores across both kinds: the only personal numbers the UI shows. */
  myScores: ScoreMap;
  /** Ranked + provisional scores for unranked places. Feeds the recommender; never displayed. */
  learnScores: ScoreMap;
  /** Everyone else's scores, for the recommender and taste matches. */
  neighbours: Neighbour[];
  /** Every visit, mine included, newest first. */
  allVisits: Visit[];
  userName: (id: string) => string;
  /** Community average and count per place, everyone including me. */
  crowd: Record<string, { avg: number; count: number }>;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [ready, setReady] = useState(false);
  const [community] = useState(() => buildCommunity(new Date()));

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const stored = parseStored(raw);
        if (!cancelled && stored) dispatch({ type: 'hydrate', state: stored });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  const value = useMemo<Store>(() => {
    const myScores = { ...scoresOf(state.rankings.cafe), ...scoresOf(state.rankings.restaurant) };
    const neighbours = community.users.map((u) => ({
      userId: u.id,
      name: u.name,
      scores: { ...scoresOf(community.rankings[u.id].cafe), ...scoresOf(community.rankings[u.id].restaurant) },
    }));
    const allVisits = [...state.visits, ...community.visits].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const names: Record<string, string> = Object.fromEntries(community.users.map((u) => [u.id, u.name]));
    names[ME] = state.me.name || 'You';
    const learnScores = learningScores(state, myScores);
    const crowd: Store['crowd'] = {};
    for (const m of [myScores, ...neighbours.map((n) => n.scores)]) {
      for (const [placeId, score] of Object.entries(m)) {
        const c = (crowd[placeId] ??= { avg: 0, count: 0 });
        c.avg = (c.avg * c.count + score) / (c.count + 1);
        c.count += 1;
      }
    }
    return { state, dispatch, community, myScores, learnScores, neighbours, allVisits, crowd, userName: (id) => names[id] ?? 'Someone' };
  }, [state, community]);

  if (!ready) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
