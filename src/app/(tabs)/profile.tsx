import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { shortDate } from '@/domain/clock';
import { PLACE_BY_ID } from '@/domain/seed-places';
import type { Kind } from '@/domain/types';
import { TAG_LABEL } from '@/domain/vocabulary';
import { tasteVector } from '@/reco/engine';
import { scoresOf } from '@/reco/ranking';
import { useStore } from '@/store/provider';
import { reactionLabel } from '@/store/state';
import { font, space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { PlaceRow } from '@/ui/place-row';
import { Rule, Score, Screen, SectionLabel, Segmented, TextAction, Txt } from '@/ui/primitives';

export default function Profile() {
  const { state, dispatch, myScores, learnScores } = useStore();
  const router = useRouter();
  const c = usePalette();
  const [kind, setKind] = useState<Kind>('cafe');
  const [confirmReset, setConfirmReset] = useState(false);

  const taste = useMemo(() => {
    const v = tasteVector({ prefs: state.prefs, scores: learnScores }, PLACE_BY_ID);
    const entries = Object.entries(v).filter(([, w]) => Math.abs(w) > 0.05);
    const likes = entries.filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const dislikes = entries.filter(([, w]) => w < 0).sort((a, b) => a[1] - b[1]).slice(0, 4);
    return { likes, dislikes, max: Math.max(0.01, ...likes.map(([, w]) => w)) };
  }, [state.prefs, learnScores]);

  const ranking = state.rankings[kind];
  const unrankedHere = state.unranked.filter((e) => PLACE_BY_ID[e.placeId]?.kind === kind);
  const scores = scoresOf(ranking);

  return (
    <Screen>
      <Txt v="meta" tone="ink3" style={{ marginBottom: space.sm }}>
        @{state.me.handle} · {state.origin.label.toUpperCase()}
      </Txt>
      <Txt v="display">{state.me.name}</Txt>

      {/* Asymmetric stats: one big number, three small. */}
      <View style={[styles.stats, { borderTopColor: c.ink, borderBottomColor: c.rule }]}>
        <View style={{ flex: 2 }}>
          <Txt v="display" style={{ fontFamily: font.monoMedium }}>
            {state.rankings.cafe.length + state.rankings.restaurant.length + state.unranked.length}
          </Txt>
          <Txt v="label" tone="ink2">
            Places been
          </Txt>
        </View>
        <View style={{ flex: 3, gap: space.xs }}>
          {[
            ['Visits logged', state.visits.length],
            ['Ranked', state.rankings.cafe.length + state.rankings.restaurant.length],
            ['Want to go', state.wantToGo.length],
          ].map(([label, n]) => (
            <View key={label} style={styles.statRow}>
              <Txt v="small" tone="ink2">
                {label}
              </Txt>
              <Txt v="numeral">{n}</Txt>
            </View>
          ))}
        </View>
      </View>

      <SectionLabel>Your taste, as Thoq sees it</SectionLabel>
      {taste.likes.map(([tag, w]) => (
        <View key={tag} style={styles.bar}>
          <Txt v="small" style={{ width: 132 }} numberOfLines={1}>
            {TAG_LABEL[tag] ?? tag}
          </Txt>
          <View style={{ flex: 1, height: 6, backgroundColor: c.raised }}>
            <View style={{ width: `${(w / taste.max) * 100}%`, height: 6, backgroundColor: c.ink }} />
          </View>
        </View>
      ))}
      {taste.dislikes.length ? (
        <Txt v="small" tone="ink3" style={{ marginTop: space.sm }}>
          Steering away from: {taste.dislikes.map(([t]) => TAG_LABEL[t] ?? t).join(', ')}
        </Txt>
      ) : null}
      <Txt v="small" tone="ink3" style={{ marginTop: space.sm }}>
        Starts from your onboarding answers; every place you rank above 5 pulls its tags up, below 5 pulls them down.
      </Txt>

      <SectionLabel>Rankings</SectionLabel>
      <Segmented
        items={[
          { value: 'cafe', label: `Cafés (${state.rankings.cafe.length})` },
          { value: 'restaurant', label: `Restaurants (${state.rankings.restaurant.length})` },
        ]}
        value={kind}
        onChange={setKind}
      />
      {ranking.length === 0 ? (
        <Txt v="body" tone="ink2" style={{ marginTop: space.md }}>
          Nothing ranked yet. Log a visit and it lands here.
        </Txt>
      ) : null}
      {ranking.map((e, i) => (
        <PlaceRow key={e.placeId} place={PLACE_BY_ID[e.placeId]} rank={i + 1} score={scores[e.placeId]} />
      ))}
      {unrankedHere.length ? (
        <>
          <View style={styles.unrankedHead}>
            <Txt v="label" tone="ink2">
              Been, not ranked yet · {unrankedHere.length}
            </Txt>
            <TextAction
              label={`Rank ${Math.min(3, state.unranked.length)}`}
              onPress={() => router.push({ pathname: '/compare', params: { batch: String(Math.min(3, state.unranked.length)) } })}
            />
          </View>
          {unrankedHere.map((e) => (
            <PlaceRow key={e.placeId} place={PLACE_BY_ID[e.placeId]} note={reactionLabel(e.reaction)} />
          ))}
        </>
      ) : null}

      <SectionLabel right={<TextAction label="New list" onPress={() => router.push('/list/new')} />}>Lists</SectionLabel>
      <Rule />
      <Pressable onPress={() => router.push({ pathname: '/list/[id]', params: { id: 'want' } })} style={({ pressed }) => [styles.listRow, { borderBottomColor: c.rule, opacity: pressed ? 0.6 : 1 }]}>
        <Txt v="heading">Want to go</Txt>
        <Txt v="meta" tone="ink3">
          {state.wantToGo.length}
        </Txt>
      </Pressable>
      {state.lists.map((l) => (
        <Pressable
          key={l.id}
          onPress={() => router.push({ pathname: '/list/[id]', params: { id: l.id } })}
          style={({ pressed }) => [styles.listRow, { borderBottomColor: c.rule, opacity: pressed ? 0.6 : 1 }]}>
          <Txt v="heading" style={{ flex: 1 }} numberOfLines={1}>
            {l.title}
          </Txt>
          <Txt v="meta" tone="ink3">
            {l.placeIds.length}
          </Txt>
        </Pressable>
      ))}

      <SectionLabel>Diary</SectionLabel>
      <Rule />
      {state.visits.slice(0, 20).map((v) => (
        <Pressable
          key={v.id}
          onPress={() => router.push({ pathname: '/place/[id]', params: { id: v.placeId } })}
          style={({ pressed }) => [styles.diary, { borderBottomColor: c.rule, opacity: pressed ? 0.6 : 1 }]}>
          <Txt v="meta" tone="ink3" style={{ width: 52 }}>
            {shortDate(v.date).toUpperCase()}
          </Txt>
          <View style={{ flex: 1 }}>
            <Txt v="bodyStrong" numberOfLines={1}>
              {PLACE_BY_ID[v.placeId]?.name}
            </Txt>
            <Txt v="small" tone="ink3">
              {reactionLabel(v.reaction)}
              {v.ordered.length ? ` · ${v.ordered.join(', ')}` : ''}
            </Txt>
          </View>
          <Score value={myScores[v.placeId] ?? null} />
        </Pressable>
      ))}

      <View style={{ marginTop: space.xxxl, gap: space.md }}>
        <TextAction
          label={confirmReset ? 'Tap again to erase everything on this device' : 'Reset all data'}
          onPress={() => {
            if (confirmReset) {
              dispatch({ type: 'reset' });
              router.replace('/onboarding');
            } else setConfirmReset(true);
          }}
        />
        <Txt v="small" tone="ink3">
          Thoq MVP · data is stored on this device only. Places and community are demo data.
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: space.xl, marginTop: space.xl, paddingVertical: space.lg, borderTopWidth: 1.5, borderBottomWidth: StyleSheet.hairlineWidth },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  unrankedHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: space.xl, marginBottom: space.xs },
  diary: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
});
