import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { distanceKm, isOpenAt, riyadhMinutes } from '@/domain/geo';
import { PLACES } from '@/domain/seed-places';
import { areaByName, TAG_GROUPS, TAG_LABEL } from '@/domain/vocabulary';
import { useStore } from '@/store/provider';
import { GUTTER, inputReset, space, type } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { PlaceRow } from '@/ui/place-row';
import { Choice, PageHead, Rule, Screen, Segmented, Txt } from '@/ui/primitives';

type Sort = 'score' | 'distance' | 'name';

const QUICK_TAGS = ['pour-over', 'espresso', 'saudi-coffee', 'laptop', 'late', 'outdoor', 'date', 'pastry', 'saudi', 'japanese', 'levantine', 'burgers'];

/** Accent-insensitive, case-insensitive match against name, Arabic name, area, category, tags and menu. */
function matches(q: string, fields: string[]): boolean {
  const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const needle = norm(q.trim());
  if (!needle) return true;
  return needle.split(/\s+/).every((word) => fields.some((f) => norm(f).includes(word)));
}

export default function Search() {
  const { state, myScores, crowd } = useStore();
  const c = usePalette();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'any' | 'cafe' | 'restaurant'>('any');
  const [tags, setTags] = useState<string[]>([]);
  const [openNow, setOpenNow] = useState(false);
  const [sort, setSort] = useState<Sort>('score');

  const origin = areaByName(state.me.area);
  const minutes = riyadhMinutes(new Date());

  const results = useMemo(() => {
    const rows = PLACES.filter(
      (p) =>
        (kind === 'any' || p.kind === kind) &&
        tags.every((t) => p.tags.includes(t)) &&
        (!openNow || isOpenAt(p.hours, minutes)) &&
        matches(q, [p.name, p.nameAr, p.area, p.category, ...p.tags.map((t) => TAG_LABEL[t] ?? t), ...p.menu]),
    ).map((p) => ({ p, km: distanceKm(origin, p), mine: myScores[p.id], crowd: crowd[p.id] }));
    rows.sort((a, b) =>
      sort === 'distance'
        ? a.km - b.km
        : sort === 'name'
          ? a.p.name.localeCompare(b.p.name)
          : (b.crowd?.avg ?? -1) - (a.crowd?.avg ?? -1),
    );
    return rows;
  }, [q, kind, tags, openNow, sort, origin, minutes, myScores, crowd]);

  const toggleTag = (t: string) => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);

  return (
    <Screen>
      <PageHead title="Search" />
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Name, dish, area — “cortado”, “Hittin”, “kabsa”"
        placeholderTextColor={c.ink3}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search places"
        style={[type.heading, inputReset, styles.input, { color: c.ink, borderBottomColor: c.ink }]}
      />

      <Segmented
        items={[
          { value: 'any', label: 'All' },
          { value: 'cafe', label: 'Cafés' },
          { value: 'restaurant', label: 'Restaurants' },
        ]}
        value={kind}
        onChange={setKind}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md, marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: GUTTER }}>
        <Choice label="Open now" selected={openNow} onPress={() => setOpenNow(!openNow)} />
        {QUICK_TAGS.filter((t) => kind === 'any' || TAG_GROUPS.find((g) => g.tags.some((x) => x.id === t))?.kind !== (kind === 'cafe' ? 'restaurant' : 'cafe')).map((t) => (
          <Choice key={t} label={TAG_LABEL[t]} selected={tags.includes(t)} onPress={() => toggleTag(t)} />
        ))}
      </ScrollView>

      <View style={styles.summary}>
        <Txt v="meta" tone="ink3">
          {results.length} {results.length === 1 ? 'PLACE' : 'PLACES'}
        </Txt>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          {(['score', 'distance', 'name'] as Sort[]).map((s) => (
            <Txt key={s} v="meta" tone={sort === s ? 'accent' : 'ink3'} style={{ textDecorationLine: sort === s ? 'underline' : 'none' }} onPress={() => setSort(s)}>
              {s.toUpperCase()}
            </Txt>
          ))}
        </View>
      </View>
      <Rule />

      {results.map(({ p, mine, crowd: cr }) => (
        <PlaceRow
          key={p.id}
          place={p}
          score={mine ?? cr?.avg ?? null}
          scoreCaption={mine !== undefined ? 'yours' : cr ? `${cr.count} ${cr.count === 1 ? 'score' : 'scores'}` : 'unranked'}
        />
      ))}
      {results.length === 0 ? (
        <Txt v="body" tone="ink2" style={{ marginTop: space.xl }}>
          No places match. Remove a filter or try a dish name.
        </Txt>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderBottomWidth: 1.5, paddingVertical: space.sm, marginBottom: space.xl },
  summary: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.sm },
});
