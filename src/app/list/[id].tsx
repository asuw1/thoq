import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { PLACE_BY_ID } from '@/domain/seed-places';
import { useStore } from '@/store/provider';
import { ME } from '@/store/state';
import { space } from '@/theme/tokens';
import { PlaceRow } from '@/ui/place-row';
import { BackBar, Rule, Screen, TextAction, Txt } from '@/ui/primitives';

export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { state, dispatch, community, myScores, crowd, userName } = useStore();
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      <View style={{ marginTop: space.xl }}>
        <Rule strong />
      </View>
      {list.placeIds.length === 0 ? (
        <Txt v="body" tone="ink2" style={{ marginTop: space.md }}>
          Empty for now. Open any place and choose “{list.id === 'want' ? 'Want to go' : 'Add to a list'}”.
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
