import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';

import { PLACES } from '@/domain/seed-places';
import { useStore } from '@/store/provider';
import { inputReset, radius, space, type } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { PlaceRow } from '@/ui/place-row';
import { BackBar, Button, Rule, Screen, ToggleTabs, Txt } from '@/ui/primitives';

/** Add places to one of your lists without leaving it: search, tap +, done. */
export default function AddToList() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = usePalette();
  const { state, dispatch, crowd } = useStore();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'cafe' | 'restaurant' | null>(null);
  const list = state.lists.find((l) => l.id === id);
  if (!list) return null;

  const q = query.trim().toLowerCase();
  const results = PLACES.filter(
    (p) => (!kind || p.kind === kind) && (!q || p.name.toLowerCase().includes(q) || p.area.toLowerCase().includes(q) || p.nameAr.includes(query.trim())),
  );

  return (
    <Screen footer={<Button label={`Done · ${list.placeIds.length} place${list.placeIds.length === 1 ? '' : 's'}`} onPress={() => router.back()} />}>
      <BackBar />
      <Txt v="meta" tone="ink3" style={{ marginBottom: space.sm }}>
        ADD TO {list.title.toUpperCase()}
      </Txt>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search places"
        placeholderTextColor={c.ink3}
        autoFocus
        autoCorrect={false}
        accessibilityLabel="Search places to add"
        style={[type.heading, inputReset, styles.input, { color: c.ink, borderBottomColor: c.ink }]}
      />
      <ToggleTabs
        items={[
          { value: 'cafe', label: 'Cafés' },
          { value: 'restaurant', label: 'Restaurants' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <Rule style={{ marginTop: space.md }} />
      {results.map((p) => {
        const inList = list.placeIds.includes(p.id);
        return (
          <PlaceRow
            key={p.id}
            place={p}
            onPress={() => dispatch({ type: 'toggleInList', listId: list.id, placeId: p.id })}
            right={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={inList ? `Remove ${p.name}` : `Add ${p.name}`}
                onPress={() => dispatch({ type: 'toggleInList', listId: list.id, placeId: p.id })}
                hitSlop={8}
                style={[styles.plus, { borderColor: inList ? c.ink : c.rule, backgroundColor: inList ? c.ink : 'transparent' }]}>
                <Txt v="bodyStrong" tone={inList ? 'onInk' : 'ink'}>
                  {inList ? '✓' : '+'}
                </Txt>
              </Pressable>
            }
            note={crowd[p.id] ? `${crowd[p.id].avg.toFixed(1)} average` : undefined}
          />
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderBottomWidth: 1.5, paddingVertical: space.sm, marginBottom: space.lg },
  plus: { width: 36, height: 36, borderWidth: 1, borderRadius: radius, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
});
