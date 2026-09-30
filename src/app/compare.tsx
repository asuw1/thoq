import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PLACE_BY_ID } from '@/domain/seed-places';
import type { Place } from '@/domain/types';
import { pivot, remainingQuestions } from '@/reco/ranking';
import { useStore } from '@/store/provider';
import { reactionLabel } from '@/store/state';
import { radius, space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { placeMeta } from '@/ui/place-row';
import { Score, Screen, TextAction, Txt } from '@/ui/primitives';

function Option({ place, caption, onPress }: { place: Place; caption: ReactNode; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Rather go back to ${place.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.option, { borderColor: pressed ? c.ink : c.rule, backgroundColor: pressed ? c.raised : 'transparent' }]}>
      <Txt v="title">{place.name}</Txt>
      <Txt v="meta" tone="ink3" style={{ marginTop: space.xs }}>
        {placeMeta(place)}
      </Txt>
      <View style={{ marginTop: space.lg }}>{caption}</View>
    </Pressable>
  );
}

/**
 * Head-to-head questions for one place. With `?batch=N`, ranks up to N places the user
 * has been to but not ranked yet, one after another.
 */
export default function Compare() {
  const { batch } = useLocalSearchParams<{ batch?: string }>();
  const { state, dispatch, myScores } = useStore();
  const router = useRouter();
  const pending = state.pending;
  const lastPlace = useRef<string | null>(pending?.placeId ?? null);
  const batchLeft = useRef(batch ? Math.max(0, Number(batch) || 0) : 0);
  const cancelled = useRef(false);

  useEffect(() => {
    if (pending) {
      lastPlace.current = pending.placeId;
      return;
    }
    // Batch mode: start the next unranked place. Some commit instantly (nothing to compare
    // against), which changes state and brings us straight back here for the next one.
    if (!cancelled.current && batchLeft.current > 0 && state.unranked.length > 0) {
      batchLeft.current -= 1;
      dispatch({ type: 'rankNext' });
      return;
    }
    if (batch) {
      if (router.canGoBack()) router.back();
      else router.replace('/profile');
    } else if (lastPlace.current && !cancelled.current) {
      router.replace({ pathname: '/place/[id]', params: { id: lastPlace.current, ranked: '1' } });
    } else router.replace('/');
  }, [pending, state.unranked.length, batch, dispatch, router]);

  if (!pending) return null;
  const newPlace = PLACE_BY_ID[pending.placeId];
  const otherId = pivot(pending.session);
  if (!newPlace || !otherId) return null;
  const other = PLACE_BY_ID[otherId];
  const left = remainingQuestions(pending.session);

  return (
    <Screen scroll={false}>
      <View style={styles.head}>
        <Txt v="meta" tone="ink3" style={{ flex: 1 }}>
          {pending.session.asked + 1} OF ≤{pending.session.asked + left} · {reactionLabel(pending.reaction).toUpperCase()}
        </Txt>
        <TextAction
          label={pending.visit ? 'Discard visit' : 'Stop'}
          onPress={() => {
            cancelled.current = true;
            dispatch({ type: 'cancelPending' });
          }}
        />
      </View>
      <Txt v="display" style={{ marginBottom: space.xl }}>
        Which would you rather go back to?
      </Txt>

      <Option
        place={newPlace}
        caption={
          <Txt v="label" tone="olive">
            {pending.visit ? 'Just visited' : 'Ranking now'}
          </Txt>
        }
        onPress={() => dispatch({ type: 'answer', answer: 'new' })}
      />
      <Txt v="meta" tone="ink3" style={{ marginVertical: space.sm, textAlign: 'center' }}>
        OR
      </Txt>
      <Option
        place={other}
        caption={
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
            <Txt v="label" tone="ink2">
              You ranked it
            </Txt>
            <Score value={myScores[other.id]} />
          </View>
        }
        onPress={() => dispatch({ type: 'answer', answer: 'existing' })}
      />

      <View style={{ flexDirection: 'row', gap: space.xl, marginTop: space.xl }}>
        <TextAction label="Too close to call" onPress={() => dispatch({ type: 'answer', answer: 'tie' })} />
        <TextAction label="Not comparable" onPress={() => dispatch({ type: 'answer', answer: 'skip' })} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.sm },
  option: { borderWidth: 1, borderRadius: radius, padding: space.xl },
});
