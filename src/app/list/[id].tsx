import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PLACE_BY_ID, PLACES } from '@/domain/seed-places';
import { suggestForList } from '@/reco/engine';
import { useStore } from '@/store/provider';
import { ME } from '@/store/state';
import { radius, space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { PlaceRow } from '@/ui/place-row';
import { BackBar, Button, Rule, Screen, SectionLabel, TextAction, Txt } from '@/ui/primitives';

export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { state, dispatch, community, myScores, crowd, userName } = useStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const c = usePalette();

  const list =
    id === 'want'
      ? { id: 'want', ownerId: ME, title: 'Want to go', description: 'Places you’ve saved. Logging a visit removes it from here.', placeIds: state.wantToGo }
      : (state.lists.find((l) => l.id === id) ?? community.lists.find((l) => l.id === id));

  if (!list) {
    return (
      <Screen>
        <BackBar />
        <Txt v="title">This list no longer exists.</Txt>
      </Screen>
    );
  }

  const mine = list.ownerId === ME;
  const editable = mine && list.id !== 'want';
  const suggestions = editable ? suggestForList(list.placeIds, PLACES, crowd) : [];

  return (
    <Screen>
      <BackBar />
      <Txt v="meta" tone="ink3" style={{ marginBottom: space.sm }}>
        {mine ? 'YOUR LIST' : `LIST BY ${userName(list.ownerId).toUpperCase()}`} · {list.placeIds.length} PLACES
      </Txt>
      <Txt v="display">{list.title}</Txt>
      {list.description ? (
        <Txt v="body" tone="ink2" style={{ marginTop: space.sm }}>
          {list.description}
        </Txt>
      ) : null}
      {editable ? (
        <View style={{ marginTop: space.lg, flexDirection: 'row' }}>
          <Button kind="secondary" label="Add places" onPress={() => router.push({ pathname: '/list/add/[id]', params: { id: list.id } })} />
        </View>
      ) : null}
      <View style={{ marginTop: space.xl }}>
        <Rule strong />
      </View>
      {list.placeIds.length === 0 ? (
        <Txt v="body" tone="ink2" style={{ marginTop: space.md }}>
          {editable ? 'Empty for now. Tap “Add places” to start.' : 'Empty for now. Open any place and tap “Want to go”.'}
        </Txt>
      ) : null}
      {list.placeIds.map((pid, i) => {
        const place = PLACE_BY_ID[pid];
        if (!place) return null;
        return (
          <PlaceRow
            key={pid}
            place={place}
            rank={i + 1}
            score={myScores[pid] ?? crowd[pid]?.avg ?? null}
            scoreCaption={myScores[pid] !== undefined ? 'yours' : crowd[pid] ? 'avg' : undefined}
          />
        );
      })}
      {editable && suggestions.length ? (
        <>
          <SectionLabel>Suggested for this list</SectionLabel>
          <Rule />
          {suggestions.map((p) => (
            <PlaceRow
              key={p.id}
              place={p}
              note={crowd[p.id] ? `${crowd[p.id].avg.toFixed(1)} average` : undefined}
              right={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${p.name}`}
                  hitSlop={8}
                  onPress={() => dispatch({ type: 'toggleInList', listId: list.id, placeId: p.id })}
                  style={[styles.plus, { borderColor: c.rule }]}>
                  <Txt v="bodyStrong">+</Txt>
                </Pressable>
              }
            />
          ))}
        </>
      ) : null}
      {editable ? (
        <View style={{ marginTop: space.xxl }}>
          <TextAction
            label={confirmDelete ? 'Tap again to delete this list' : 'Delete list'}
            onPress={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              dispatch({ type: 'deleteList', listId: list.id });
              router.back();
            }}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  plus: { width: 36, height: 36, borderWidth: 1, borderRadius: radius, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
});
