import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { shortDate } from '@/domain/clock';
import { PLACE_BY_ID } from '@/domain/seed-places';
import { tasteMatch } from '@/reco/engine';
import { useStore } from '@/store/provider';
import { ME, reactionLabel } from '@/store/state';
import { font, space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { PageHead, Rule, Score, Screen, SectionLabel, Segmented, TextAction, Txt } from '@/ui/primitives';

export default function Feed() {
  const { state, dispatch, community, neighbours, myScores, allVisits, userName } = useStore();
  const router = useRouter();
  const c = usePalette();
  const [scope, setScope] = useState<'following' | 'everyone'>(state.following.length ? 'following' : 'everyone');

  const people = useMemo(
    () =>
      community.users
        .map((u) => ({ u, match: tasteMatch(myScores, neighbours.find((n) => n.userId === u.id)?.scores ?? {}) }))
        .sort((a, b) => (b.match?.percent ?? 0) - (a.match?.percent ?? 0)),
    [community.users, myScores, neighbours],
  );

  const scoreOf = (userId: string, placeId: string) =>
    userId === ME ? myScores[placeId] : neighbours.find((n) => n.userId === userId)?.scores[placeId];

  const items = allVisits
    .filter((v) => v.userId !== ME && (scope === 'everyone' || state.following.includes(v.userId)))
    .slice(0, 40);

  const suggestions = people.filter((p) => !state.following.includes(p.u.id)).slice(0, 3);

  return (
    <Screen>
      <PageHead title="Feed" />
      <Segmented
        items={[
          { value: 'following', label: `Following${state.following.length ? ` (${state.following.length})` : ''}` },
          { value: 'everyone', label: 'Everyone' },
        ]}
        value={scope}
        onChange={setScope}
      />

      {suggestions.length ? (
        <>
          <SectionLabel right={<Txt v="meta" tone="ink3">TASTE MATCH</Txt>}>People to follow</SectionLabel>
          <Rule />
          {suggestions.map(({ u, match }) => (
            <View key={u.id} style={[styles.person, { borderBottomColor: c.rule }]}>
              <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/user/[id]', params: { id: u.id } })}>
                <Txt v="bodyStrong">
                  {u.name}{' '}
                  <Txt v="meta" tone="ink3">
                    @{u.handle}
                  </Txt>
                </Txt>
                <Txt v="small" tone="ink2" numberOfLines={1}>
                  {u.bio}
                </Txt>
              </Pressable>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Txt v="numeral" tone={match && match.percent >= 75 ? 'accent' : 'ink'}>
                  {match ? `${match.percent}%` : '—'}
                </Txt>
                <TextAction label="Follow" onPress={() => dispatch({ type: 'toggleFollow', userId: u.id })} />
              </View>
            </View>
          ))}
          {!Object.keys(myScores).length ? (
            <Txt v="small" tone="ink3" style={{ marginTop: space.sm }}>
              Taste match needs at least two places you’ve both ranked. Log a few visits and these fill in.
            </Txt>
          ) : null}
        </>
      ) : null}

      <SectionLabel>{scope === 'following' ? 'From people you follow' : 'Recent visits'}</SectionLabel>
      <Rule />
      {items.length === 0 ? (
        <Txt v="body" tone="ink2" style={{ marginTop: space.md }}>
          Nothing yet. Follow a few people above, or switch to Everyone.
        </Txt>
      ) : null}
      {items.map((v) => {
        const place = PLACE_BY_ID[v.placeId];
        if (!place) return null;
        return (
          <View key={v.id} style={[styles.item, { borderBottomColor: c.rule }]}>
            <View style={styles.itemHead}>
              <Txt v="small" tone="ink2" style={{ flex: 1 }}>
                <Txt v="small" tone="ink" style={{ fontFamily: font.bodySemi }} onPress={() => router.push({ pathname: '/user/[id]', params: { id: v.userId } })}>
                  {userName(v.userId)}
                </Txt>
                {' · '}
                {reactionLabel(v.reaction).toLowerCase()}
              </Txt>
              <Txt v="meta" tone="ink3">
                {shortDate(v.date)}
              </Txt>
            </View>
            <Pressable onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })} style={styles.itemPlace}>
              {({ pressed }) => (
                <>
                  <Txt v="heading" style={{ flex: 1, opacity: pressed ? 0.6 : 1 }}>
                    {place.name}
                  </Txt>
                  <Score value={scoreOf(v.userId, v.placeId) ?? null} />
                </>
              )}
            </Pressable>
            {v.note ? (
              <Txt v="body" tone="ink2">
                {v.note}
              </Txt>
            ) : null}
          </View>
        );
      })}

      <SectionLabel>Lists</SectionLabel>
      <Rule />
      {community.lists.map((l) => (
        <Pressable
          key={l.id}
          onPress={() => router.push({ pathname: '/list/[id]', params: { id: l.id } })}
          style={({ pressed }) => [styles.item, { borderBottomColor: c.rule, opacity: pressed ? 0.6 : 1 }]}>
          <Txt v="heading">{l.title}</Txt>
          <Txt v="meta" tone="ink3" style={{ marginTop: 2 }}>
            {userName(l.ownerId).toUpperCase()} · {l.placeIds.length} PLACES
          </Txt>
          <Txt v="small" tone="ink2" style={{ marginTop: space.xs }} numberOfLines={1}>
            {l.placeIds.map((id) => PLACE_BY_ID[id]?.name).filter(Boolean).join(', ')}
          </Txt>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  item: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  itemPlace: { flexDirection: 'row', alignItems: 'baseline', gap: space.md, marginTop: space.xs, marginBottom: space.xs },
});
