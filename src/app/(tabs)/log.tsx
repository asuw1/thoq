import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { riyadhToday, shortDate } from '@/domain/clock';
import { PLACE_BY_ID, PLACES } from '@/domain/seed-places';
import type { Reaction } from '@/domain/types';
import { BANDS, isDone, REACTIONS, startSession } from '@/reco/ranking';
import { useStore } from '@/store/provider';
import { reactionLabel } from '@/store/state';
import { inputReset, radius, space, type } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { placeMeta, PlaceRow } from '@/ui/place-row';
import { Button, Choice, PageHead, Rule, Screen, SectionLabel, TextAction, Txt } from '@/ui/primitives';

/** Tabs stay mounted; re-key the form whenever another screen sends us a place so it starts clean. */
export default function Log() {
  const { placeId } = useLocalSearchParams<{ placeId?: string }>();
  return <LogForm key={placeId ?? 'none'} initialPlaceId={placeId ?? null} />;
}

function LogForm({ initialPlaceId }: { initialPlaceId: string | null }) {
  const router = useRouter();
  const c = usePalette();
  const { state, dispatch, myScores } = useStore();

  const [placeId, setPlaceId] = useState<string | null>(initialPlaceId);
  const [query, setQuery] = useState('');
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [ordered, setOrdered] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [note, setNote] = useState('');
  const [daysAgo, setDaysAgo] = useState(0);

  const place = placeId ? PLACE_BY_ID[placeId] : null;
  const previous = placeId ? state.visits.find((v) => v.placeId === placeId) : undefined;

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PLACES.filter((p) => !q || p.name.toLowerCase().includes(q) || p.area.toLowerCase().includes(q) || p.nameAr.includes(q)).slice(0, q ? 20 : 8);
  }, [query]);

  const reset = () => {
    setPlaceId(null);
    setQuery('');
    setReaction(null);
    setOrdered([]);
    setExtra('');
    setNote('');
    setDaysAgo(0);
    router.setParams({ placeId: undefined });
  };

  const save = () => {
    if (!place || !reaction) return;
    const items = [...ordered, ...extra.split(',').map((s) => s.trim()).filter(Boolean)];
    const date = riyadhToday(new Date(Date.now() - daysAgo * 86400000));
    const needsComparisons = !isDone(startSession(state.rankings[place.kind], place.id, reaction));
    dispatch({ type: 'log', visit: { placeId: place.id, reaction, ordered: items, note: note.trim(), date } });
    const id = place.id;
    reset();
    if (needsComparisons) router.push('/compare');
    else router.push({ pathname: '/place/[id]', params: { id } });
  };

  if (!place) {
    return (
      <Screen>
        <PageHead eyebrow="LOG A VISIT" title="Where did you go?" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search places"
          placeholderTextColor={c.ink3}
          autoCorrect={false}
          accessibilityLabel="Search places to log"
          style={[type.heading, inputReset, styles.input, { color: c.ink, borderBottomColor: c.ink }]}
        />
        {!query && state.wantToGo.length ? (
          <>
            <SectionLabel>From your want-to-go</SectionLabel>
            <Rule />
            {state.wantToGo.slice(0, 4).map((id) => (
              <PlaceRow key={id} place={PLACE_BY_ID[id]} onPress={() => setPlaceId(id)} />
            ))}
          </>
        ) : null}
        <SectionLabel>{query ? 'Matches' : 'All places'}</SectionLabel>
        <Rule />
        {candidates.map((p) => (
          <PlaceRow key={p.id} place={p} score={myScores[p.id]} scoreCaption={myScores[p.id] !== undefined ? 'yours' : undefined} onPress={() => setPlaceId(p.id)} />
        ))}
      </Screen>
    );
  }

  const footer = (
    <Button
      label={reaction ? (isDone(startSession(state.rankings[place.kind], place.id, reaction)) ? 'Save visit' : 'Save and compare') : 'Choose how it was'}
      disabled={!reaction}
      onPress={save}
    />
  );

  return (
    <Screen footer={footer}>
      <View style={styles.head}>
        <Txt v="meta" tone="ink3">
          LOG A VISIT
        </Txt>
        <TextAction label="Change place" onPress={reset} />
      </View>
      <Txt v="display">{place.name}</Txt>
      <Txt v="meta" tone="ink3" style={{ marginTop: space.xs }}>
        {placeMeta(place)}
      </Txt>
      {previous ? (
        <Txt v="small" tone="ink2" style={{ marginTop: space.sm }}>
          You logged this on {shortDate(previous.date)} and ranked it {myScores[place.id]?.toFixed(1)}. Logging again re-ranks it.
        </Txt>
      ) : null}

      <SectionLabel>When</SectionLabel>
      <View style={styles.wrap}>
        {[0, 1, 2].map((d) => (
          <Choice key={d} label={d === 0 ? 'Today' : d === 1 ? 'Yesterday' : '2 days ago'} selected={daysAgo === d} onPress={() => setDaysAgo(d)} />
        ))}
      </View>

      <SectionLabel>How was it</SectionLabel>
      {REACTIONS.map((r) => {
        const on = reaction === r;
        return (
          <Pressable
            key={r}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => setReaction(r)}
            style={({ pressed }) => [
              styles.reaction,
              { borderColor: on ? c.ink : c.rule, backgroundColor: on ? c.ink : pressed ? c.raised : 'transparent' },
            ]}>
            <Txt v="heading" tone={on ? 'onInk' : 'ink'}>
              {reactionLabel(r)}
            </Txt>
            <Txt v="meta" tone={on ? 'onInk' : 'ink3'}>
              {BANDS[r].lo.toFixed(1)}–{BANDS[r].hi.toFixed(1)}
            </Txt>
          </Pressable>
        );
      })}
      <Txt v="small" tone="ink3" style={{ marginTop: space.xs }}>
        Your reaction sets the range. A few quick comparisons with places you’ve ranked set the exact score.
      </Txt>

      <SectionLabel>What you had</SectionLabel>
      <View style={styles.wrap}>
        {place.menu.map((m) => (
          <Choice key={m} label={m} selected={ordered.includes(m)} onPress={() => setOrdered(ordered.includes(m) ? ordered.filter((x) => x !== m) : [...ordered, m])} />
        ))}
      </View>
      <TextInput
        value={extra}
        onChangeText={setExtra}
        placeholder="Something else? Separate with commas"
        placeholderTextColor={c.ink3}
        style={[type.body, inputReset, styles.line, { color: c.ink, borderBottomColor: c.rule }]}
      />

      <SectionLabel right={<Txt v="meta" tone="ink3">{note.length}/280</Txt>}>Note</SectionLabel>
      <TextInput
        value={note}
        onChangeText={(t) => setNote(t.slice(0, 280))}
        placeholder="What should someone order? When should they go?"
        placeholderTextColor={c.ink3}
        multiline
        style={[type.body, inputReset, styles.note, { color: c.ink, borderColor: c.rule }]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.sm },
  input: { borderBottomWidth: 1.5, paddingVertical: space.sm, marginBottom: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  reaction: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: radius, paddingHorizontal: space.lg, paddingVertical: space.md, marginBottom: space.sm },
  line: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: space.sm, marginTop: space.sm },
  note: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius, padding: space.md, minHeight: 96, textAlignVertical: 'top' },
});
