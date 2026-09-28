import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { PLACE_BY_ID } from '@/domain/seed-places';
import { useStore } from '@/store/provider';
import { space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { BackBar, Button, PageHead, Rule, Screen, Txt } from '@/ui/primitives';

/** Toggle one place in and out of your lists. */
export default function SaveToList() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = usePalette();
  const { state, dispatch } = useStore();
  const place = PLACE_BY_ID[id];
  if (!place) return null;

  const rows = [
    { id: 'want', title: 'Want to go', on: state.wantToGo.includes(id), toggle: () => dispatch({ type: 'toggleWant', placeId: id }) },
    ...state.lists.map((l) => ({
      id: l.id,
      title: l.title,
      on: l.placeIds.includes(id),
      toggle: () => dispatch({ type: 'toggleInList', listId: l.id, placeId: id }),
    })),
  ];

  return (
    <Screen footer={<Button label="Done" onPress={() => router.back()} />}>
      <BackBar />
      <PageHead eyebrow={place.name.toUpperCase()} title="Add to a list" />
      <Rule />
      {rows.map((r) => (
        <Pressable
          key={r.id}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: r.on }}
          onPress={r.toggle}
          style={({ pressed }) => [styles.row, { borderBottomColor: c.rule, backgroundColor: pressed ? c.raised : 'transparent' }]}>
          <Txt v="heading" style={{ flex: 1 }}>
            {r.title}
          </Txt>
          <Txt v="label" tone={r.on ? 'accent' : 'ink3'}>
            {r.on ? 'Added' : 'Add'}
          </Txt>
        </Pressable>
      ))}
      <Pressable
        onPress={() => router.push({ pathname: '/list/new', params: { placeId: id } })}
        style={({ pressed }) => [styles.row, { borderBottomColor: c.rule, opacity: pressed ? 0.6 : 1 }]}>
        <Txt v="heading" tone="ink2">
          New list with this place
        </Txt>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', paddingVertical: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, gap: space.md },
});
