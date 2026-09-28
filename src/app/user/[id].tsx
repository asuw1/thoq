import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PLACE_BY_ID } from '@/domain/seed-places';
import type { Kind } from '@/domain/types';
import { tasteMatch } from '@/reco/engine';
import { scoresOf } from '@/reco/ranking';
import { useStore } from '@/store/provider';
import { font, space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { PlaceRow } from '@/ui/place-row';
import { BackBar, Button, Rule, Score, Screen, SectionLabel, Segmented, Txt } from '@/ui/primitives';

export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = usePalette();
  const { state, dispatch, community, myScores } = useStore();
  const [kind, setKind] = useState<Kind>('cafe');

  const user = community.users.find((u) => u.id === id);
  const rankings = community.rankings[id];
  const theirScores = useMemo(
    () => (rankings ? { ...scoresOf(rankings.cafe), ...scoresOf(rankings.restaurant) } : {}),
    [rankings],
  );
  const match = tasteMatch(myScores, theirScores);

  /** Where you and they disagree most — the most useful thing a taste match can show. */
  const shared = useMemo(
    () =>
      Object.keys(theirScores)
        .filter((pid) => pid in myScores)
        .map((pid) => ({ pid, mine: myScores[pid], theirs: theirScores[pid] }))
        .sort((a, b) => Math.abs(b.mine - b.theirs) - Math.abs(a.mine - a.theirs)),
    [theirScores, myScores],
  );

  if (!user || !rankings) {
    return (
      <Screen>
        <BackBar />
        <Txt v="title">Profile not found.</Txt>
      </Screen>
    );
  }

  const following = state.following.includes(user.id);
  const ranked = scoresOf(rankings[kind]);
  const lists = community.lists.filter((l) => l.ownerId === user.id);

  return (
    <Screen>
      <BackBar />
      <Txt v="meta" tone="ink3" style={{ marginBottom: space.sm }}>
        @{user.handle} · {user.area.toUpperCase()}
      </Txt>
      <Txt v="display">{user.name}</Txt>
      <Txt v="body" tone="ink2" style={{ marginTop: space.sm }}>
        {user.bio}
      </Txt>

      <View style={[styles.matchRow, { borderTopColor: c.ink, borderBottomColor: c.rule }]}>
        <View style={{ flex: 1 }}>
          <Txt v="label" tone="ink2">
            Taste match
          </Txt>
          <Txt v="display" tone={match && match.percent >= 75 ? 'accent' : 'ink'} style={{ fontFamily: font.monoMedium }}>
            {match ? `${match.percent}%` : '—'}
          </Txt>
          <Txt v="meta" tone="ink3">
            {match ? `across ${match.overlap} places you both ranked` : 'needs two places in common'}
          </Txt>
        </View>
        <Button kind={following ? 'secondary' : 'primary'} label={following ? 'Following' : 'Follow'} onPress={() => dispatch({ type: 'toggleFollow', userId: user.id })} />
      </View>

      {shared.length ? (
        <>
          <SectionLabel right={<Txt v="meta" tone="ink3">YOU · {user.name.toUpperCase()}</Txt>}>Where you differ</SectionLabel>
          <Rule />
          {shared.slice(0, 4).map((s) => (
            <Pressable
              key={s.pid}
              onPress={() => router.push({ pathname: '/place/[id]', params: { id: s.pid } })}
              style={({ pressed }) => [styles.diffRow, { borderBottomColor: c.rule, opacity: pressed ? 0.6 : 1 }]}>
              <Txt v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                {PLACE_BY_ID[s.pid]?.name}
              </Txt>
              <Score value={s.mine} />
              <Txt v="meta" tone="ink3">
                ·
              </Txt>
              <Score value={s.theirs} muted />
            </Pressable>
          ))}
        </>
      ) : null}

      <SectionLabel>{user.name}’s rankings</SectionLabel>
      <Segmented
        items={[
          { value: 'cafe', label: `Cafés (${rankings.cafe.length})` },
          { value: 'restaurant', label: `Restaurants (${rankings.restaurant.length})` },
        ]}
        value={kind}
        onChange={setKind}
      />
      {rankings[kind].map((e, i) => (
        <PlaceRow
          key={e.placeId}
          place={PLACE_BY_ID[e.placeId]}
          rank={i + 1}
          score={ranked[e.placeId]}
          scoreCaption={myScores[e.placeId] !== undefined ? `you ${myScores[e.placeId].toFixed(1)}` : undefined}
        />
      ))}

      {lists.length ? (
        <>
          <SectionLabel>Lists</SectionLabel>
          <Rule />
          {lists.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => router.push({ pathname: '/list/[id]', params: { id: l.id } })}
              style={({ pressed }) => [styles.diffRow, { borderBottomColor: c.rule, opacity: pressed ? 0.6 : 1 }]}>
              <Txt v="heading" style={{ flex: 1 }}>
                {l.title}
              </Txt>
              <Txt v="meta" tone="ink3">
                {l.placeIds.length}
              </Txt>
            </Pressable>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.xl, paddingVertical: space.lg, borderTopWidth: 1.5, borderBottomWidth: StyleSheet.hairlineWidth },
  diffRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
});
