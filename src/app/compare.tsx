import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
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

function Option({ place, caption, onPress }: { place: Place; caption: React.ReactNode; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${place.name} was better`}
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

export default function Compare() {
  const { state, dispatch, myScores } = useStore();
  const router = useRouter();
  const placeIdRef = useRef(state.pending?.visit.placeId ?? null);
  const pending = state.pending;

  // Session finished (or nothing to compare): show where it landed.
  useEffect(() => {
    if (pending) return;
    const id = placeIdRef.current;
    if (id) router.replace({ pathname: '/place/[id]', params: { id, ranked: '1' } });
    else router.replace('/');
  }, [pending, router]);

  if (!pending) return null;
  const newPlace = PLACE_BY_ID[pending.visit.placeId];
  const otherId = pivot(pending.session);
  if (!otherId) return null;
  const other = PLACE_BY_ID[otherId];
  const left = remainingQuestions(pending.session);

  return (
    <Screen scroll={false}>
      <View style={styles.head}>
        <Txt v="meta" tone="ink3">
          {pending.session.asked + 1} OF ≤{pending.session.asked + left} · {reactionLabel(pending.visit.reaction).toUpperCase()}
        </Txt>
        <TextAction
          label="Discard visit"
          onPress={() => {
            placeIdRef.current = null;
            dispatch({ type: 'cancelPending' });
          }}
        />
      </View>
      <Txt v="display" style={{ marginBottom: space.xl }}>
        Which was better?
      </Txt>

      <Option
        place={newPlace}
        caption={
          <Txt v="label" tone="accent">
            Just visited
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

      <View style={{ marginTop: space.xl }}>
        <TextAction label="Too close to call" onPress={() => dispatch({ type: 'answer', answer: 'tie' })} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.sm },
  option: { borderWidth: 1, borderRadius: radius, padding: space.xl },
});
