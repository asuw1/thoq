import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { riyadhToday, shortDate } from '@/domain/clock';
import { PLACE_BY_ID } from '@/domain/seed-places';
import type { PlaceList, User, Visit } from '@/domain/types';
import { agreement, tasteLabel, tasteMatch } from '@/reco/engine';
import { useStore } from '@/store/provider';
import { ME, reactionLabel } from '@/store/state';
import { font, radius, space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { PageHead, Rule, Score, Screen, Segmented, TextAction, Txt } from '@/ui/primitives';

type Scope = 'for-you' | 'following';

type Debate = { placeId: string; a: { userId: string; score: number }; b: { userId: string; score: number } };

type Item =
  | { type: 'post'; visit: Visit }
  | { type: 'debate'; debate: Debate }
  | { type: 'people'; users: User[] }
  | { type: 'list'; list: PlaceList };

const DAY_MS = 86400000;

function Monogram({ name }: { name: string }) {
  const c = usePalette();
  return (
    <View style={[styles.monogram, { backgroundColor: c.sand }]}>
      <Txt v="heading" style={{ fontSize: 18, lineHeight: 22 }}>
        {name.charAt(0).toUpperCase()}
      </Txt>
    </View>
  );
}

export default function Feed() {
  const { state, dispatch, community, neighbours, learnScores, myScores, allVisits, userName } = useStore();
  const router = useRouter();
  const c = usePalette();
  const [scope, setScope] = useState<Scope>('for-you');

  const scoresOf = (userId: string) => (userId === ME ? myScores : (neighbours.find((n) => n.userId === userId)?.scores ?? {}));
  const labelFor = (userId: string) => tasteLabel(tasteMatch(learnScores, scoresOf(userId)));

  const items = useMemo<Item[]>(() => {
    const todayMs = Date.parse(riyadhToday(new Date()));
    const sim = Object.fromEntries(neighbours.map((n) => [n.userId, agreement(learnScores, n.scores).sim]));
    const others = allVisits.filter((v) => v.userId !== ME);

    if (scope === 'following') {
      return others.filter((v) => state.following.includes(v.userId)).slice(0, 40).map((visit) => ({ type: 'post', visit }));
    }

    // For you: written reviews, weighted towards people whose taste is close to yours and towards recent ones.
    const posts = others
      .filter((v) => v.note)
      .map((v) => {
        const days = Math.max(0, (todayMs - Date.parse(v.date)) / DAY_MS);
        const score = 2 * (sim[v.userId] ?? 0) + Math.exp(-days / 21) + (state.following.includes(v.userId) ? 0.3 : 0);
        return { v, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map(({ v }) => ({ type: 'post' as const, visit: v }));

    // Debates: the same place, scored far apart by two people.
    const byPlace: Record<string, { userId: string; score: number }[]> = {};
    for (const n of neighbours) for (const [pid, s] of Object.entries(n.scores)) (byPlace[pid] ??= []).push({ userId: n.userId, score: s });
    const debates: Debate[] = Object.entries(byPlace)
      .map(([placeId, xs]) => {
        const sorted = [...xs].sort((a, b) => b.score - a.score);
        return { placeId, a: sorted[0], b: sorted[sorted.length - 1] };
      })
      .filter((d) => d.a && d.b && d.a.score - d.b.score >= 4)
      .sort((x, y) => y.a.score - y.b.score - (x.a.score - x.b.score));

    const people = community.users
      .filter((u) => !state.following.includes(u.id) && (sim[u.id] ?? 0) > 0)
      .sort((a, b) => (sim[b.id] ?? 0) - (sim[a.id] ?? 0))
      .slice(0, 3);

    const out: Item[] = [];
    posts.forEach((p, i) => {
      out.push(p);
      if (i === 2 && debates[0]) out.push({ type: 'debate', debate: debates[0] });
      if (i === 6 && people.length) out.push({ type: 'people', users: people });
      if (i === 10 && community.lists[0]) out.push({ type: 'list', list: community.lists[0] });
      if (i === 14 && debates[1]) out.push({ type: 'debate', debate: debates[1] });
      if (i === 19 && community.lists[1]) out.push({ type: 'list', list: community.lists[1] });
    });
    return out;
  }, [scope, allVisits, neighbours, learnScores, state.following, community]);

  const openUser = (id: string) => router.push({ pathname: '/user/[id]', params: { id } });
  const openPlace = (id: string) => router.push({ pathname: '/place/[id]', params: { id } });

  const render = (it: Item, i: number): ReactNode => {
    if (it.type === 'post') {
      const v = it.visit;
      const place = PLACE_BY_ID[v.placeId];
      if (!place) return null;
      const label = labelFor(v.userId);
      const want = state.wantToGo.includes(place.id);
      return (
        <View key={v.id} style={[styles.post, { borderBottomColor: c.rule }]}>
          <Pressable accessibilityRole="link" onPress={() => openUser(v.userId)} style={styles.who}>
            <Monogram name={userName(v.userId)} />
            <View style={{ flex: 1 }}>
              <Txt v="bodyStrong">{userName(v.userId)}</Txt>
              <Txt v="small" tone={label ? 'olive' : 'ink3'}>
                {label ?? reactionLabel(v.reaction)}
                {label ? ` · ${reactionLabel(v.reaction).toLowerCase()}` : ''}
              </Txt>
            </View>
            <Txt v="meta" tone="ink3">
              {shortDate(v.date)}
            </Txt>
          </Pressable>
          {v.note ? <Txt style={styles.review}>{v.note}</Txt> : null}
          <View style={[styles.placeLine, { borderTopColor: c.rule }]}>
            <Pressable accessibilityRole="link" onPress={() => openPlace(place.id)} style={{ flex: 1 }}>
              <Txt v="bodyStrong" numberOfLines={1}>
                {place.name}
              </Txt>
              <Txt v="meta" tone="ink3" numberOfLines={1}>
                {place.category} · {place.area}
              </Txt>
            </Pressable>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Score value={scoresOf(v.userId)[place.id] ?? null} />
              {myScores[place.id] === undefined ? (
                <TextAction label={want ? 'Saved' : 'Want to go'} onPress={() => dispatch({ type: 'toggleWant', placeId: place.id })} />
              ) : null}
            </View>
          </View>
        </View>
      );
    }

    if (it.type === 'debate') {
      const { placeId, a, b } = it.debate;
      const place = PLACE_BY_ID[placeId];
      return (
        <Pressable key={`d-${placeId}`} accessibilityRole="link" onPress={() => openPlace(placeId)} style={({ pressed }) => [styles.debate, { backgroundColor: c.coffee, opacity: pressed ? 0.9 : 1 }]}>
          <Txt v="label" tone="onCoffee" style={{ opacity: 0.75 }}>
            Split decision
          </Txt>
          <Txt v="title" tone="onCoffee" style={{ marginTop: space.sm }}>
            {place.name}
          </Txt>
          <View style={styles.debateRow}>
            {[a, b].map((x, j) => (
              <View key={x.userId} style={[{ flex: 1 }, j === 1 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.onCoffee, paddingLeft: space.lg }]}>
                <Txt v="meta" tone="onCoffee" style={{ opacity: 0.75 }}>
                  {userName(x.userId).toUpperCase()}
                </Txt>
                <Txt v="display" tone="onCoffee" style={{ fontFamily: font.monoMedium }}>
                  {x.score.toFixed(1)}
                </Txt>
              </View>
            ))}
          </View>
          <Txt v="small" tone="onCoffee" style={{ marginTop: space.md, textDecorationLine: 'underline' }}>
            {myScores[placeId] === undefined ? 'Go and settle it' : `You gave it ${myScores[placeId].toFixed(1)}. See who agrees`}
          </Txt>
        </Pressable>
      );
    }

    if (it.type === 'people') {
      return (
        <View key={`p-${i}`} style={styles.module}>
          <Txt v="label" tone="olive">
            People with taste like yours
          </Txt>
          <Rule style={{ marginTop: space.sm }} />
          {it.users.map((u) => (
            <View key={u.id} style={[styles.person, { borderBottomColor: c.rule }]}>
              <Monogram name={u.name} />
              <Pressable style={{ flex: 1 }} onPress={() => openUser(u.id)}>
                <Txt v="bodyStrong">{u.name}</Txt>
                <Txt v="small" tone="ink2" numberOfLines={1}>
                  {u.bio}
                </Txt>
              </Pressable>
              <TextAction label="Follow" onPress={() => dispatch({ type: 'toggleFollow', userId: u.id })} />
            </View>
          ))}
        </View>
      );
    }

    const l = it.list;
    return (
      <Pressable key={`l-${l.id}`} onPress={() => router.push({ pathname: '/list/[id]', params: { id: l.id } })} style={({ pressed }) => [styles.module, { opacity: pressed ? 0.7 : 1 }]}>
        <Txt v="label" tone="ink2">
          A list by {userName(l.ownerId)}
        </Txt>
        <Txt v="title" style={{ marginTop: space.xs }}>
          {l.title}
        </Txt>
        <Txt v="small" tone="ink2" style={{ marginTop: space.xs }}>
          {l.placeIds.length} places · {l.placeIds.slice(0, 3).map((id) => PLACE_BY_ID[id]?.name).filter(Boolean).join(', ')}
        </Txt>
      </Pressable>
    );
  };

  return (
    <Screen>
      <PageHead title="Feed" />
      <Segmented
        items={[
          { value: 'for-you', label: 'For you' },
          { value: 'following', label: `Following${state.following.length ? ` (${state.following.length})` : ''}` },
        ]}
        value={scope}
        onChange={setScope}
      />
      {items.length === 0 ? (
        <Txt v="body" tone="ink2" style={{ marginTop: space.xl }}>
          {scope === 'following' ? 'You’re not following anyone yet. Follow people from their profile or from For you.' : 'Nothing here yet.'}
        </Txt>
      ) : null}
      {items.map(render)}
    </Screen>
  );
}

const styles = StyleSheet.create({
  post: { paddingVertical: space.xl, borderBottomWidth: StyleSheet.hairlineWidth },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  monogram: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius },
  review: { fontFamily: font.display, fontSize: 20, lineHeight: 28, marginTop: space.md },
  placeLine: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginTop: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  debate: { marginVertical: space.xl, padding: space.xl },
  debateRow: { flexDirection: 'row', marginTop: space.lg, gap: space.lg },
  module: { marginVertical: space.xl },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
});
