import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { shortDate } from '@/domain/clock';
import { distanceKm, fmtKm, fmtTime, isOpenAt, riyadhMinutes } from '@/domain/geo';
import { PLACE_BY_ID, PLACES } from '@/domain/seed-places';
import { areaByName, PRICE_LABEL, TAG_LABEL } from '@/domain/vocabulary';
import { recommend, similarPlaces, tasteMatch } from '@/reco/engine';
import { useStore } from '@/store/provider';
import { ME } from '@/store/state';
import { space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { PlaceRow } from '@/ui/place-row';
import { BackBar, Button, Rule, Score, Screen, SectionLabel, TextAction, Txt } from '@/ui/primitives';

const BINS = [
  { label: '8–10', lo: 8, hi: 10.01 },
  { label: '6–8', lo: 6, hi: 8 },
  { label: '4–6', lo: 4, hi: 6 },
  { label: '0–4', lo: 0, hi: 4 },
];

export default function PlaceScreen() {
  const { id, ranked } = useLocalSearchParams<{ id: string; ranked?: string }>();
  const router = useRouter();
  const c = usePalette();
  const { state, dispatch, myScores, neighbours, allVisits, crowd, userName } = useStore();
  const place = PLACE_BY_ID[id];

  const origin = areaByName(state.me.area);
  const minutes = riyadhMinutes(new Date());

  const everyone = useMemo(() => [{ userId: ME, scores: myScores }, ...neighbours], [myScores, neighbours]);
  const scoresHere = everyone.map((n) => n.scores[id]).filter((s): s is number => s !== undefined);
  const visits = allVisits.filter((v) => v.placeId === id);

  const rec = useMemo(() => {
    if (!place || myScores[id] !== undefined) return null;
    return recommend(
      [place],
      { prefs: state.prefs, scores: myScores, wantToGo: state.wantToGo },
      neighbours,
      { kind: 'any', origin: { ...origin, name: origin.name }, nowMinutes: minutes, openNow: false, maxPrice: null, maxKm: null },
      1,
    )[0];
  }, [place, id, state.prefs, state.wantToGo, myScores, neighbours, origin, minutes]);

  const orders = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const v of visits) for (const o of v.ordered) tally[o] = (tally[o] ?? 0) + 1;
    return Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [visits]);

  if (!place) {
    return (
      <Screen>
        <BackBar />
        <Txt v="title">This place isn’t in Thoq yet.</Txt>
      </Screen>
    );
  }

  const mine = myScores[id];
  const kindRank = state.rankings[place.kind].findIndex((e) => e.placeId === id);
  const cr = crowd[id];
  const inWant = state.wantToGo.includes(id);
  const maxBin = Math.max(1, ...BINS.map((b) => scoresHere.filter((s) => s >= b.lo && s < b.hi).length));

  return (
    <Screen>
      <BackBar />

      {ranked && mine !== undefined ? (
        <View style={[styles.banner, { borderColor: c.accent }]}>
          <Txt v="small" tone="ink">
            Ranked #{kindRank + 1} of your {state.rankings[place.kind].length} {place.kind === 'cafe' ? 'cafés' : 'restaurants'} at{' '}
            <Txt v="numeral" tone="accent">
              {mine.toFixed(1)}
            </Txt>
            .
          </Txt>
        </View>
      ) : null}

      <Txt v="meta" tone="ink3">
        {place.category.toUpperCase()} · {place.area.toUpperCase()}
      </Txt>
      <Txt v="display" style={{ marginTop: space.sm }}>
        {place.name}
      </Txt>
      <Txt v="heading" tone="ink3" style={{ marginTop: space.xs, textAlign: 'left', writingDirection: 'rtl' }}>
        {place.nameAr}
      </Txt>
      <Txt v="meta" tone="ink2" style={{ marginTop: space.md }}>
        {fmtTime(place.hours.open)}–{fmtTime(place.hours.close)} ·{' '}
        <Txt v="meta" tone={isOpenAt(place.hours, minutes) ? 'ink' : 'ink3'}>
          {isOpenAt(place.hours, minutes) ? 'Open now' : 'Closed now'}
        </Txt>
      </Txt>
      <Txt v="meta" tone="ink2">
        SAR {PRICE_LABEL[place.price]} per person · {fmtKm(distanceKm(origin, place))} from {origin.name}
      </Txt>

      {/* Scores: community on the left, you on the right, distribution below. */}
      <View style={[styles.scores, { borderTopColor: c.ink, borderBottomColor: c.rule }]}>
        <View style={{ flex: 3 }}>
          <Txt v="label" tone="ink2">
            Community
          </Txt>
          <Score value={cr?.avg ?? null} size="xl" />
          <Txt v="meta" tone="ink3">
            {cr ? `${cr.count} ${cr.count === 1 ? 'person' : 'people'} ranked it` : 'No one has ranked it yet'}
          </Txt>
        </View>
        <View style={[styles.youCol, { borderLeftColor: c.rule }]}>
          <Txt v="label" tone="ink2">
            {mine !== undefined ? 'You' : 'Predicted'}
          </Txt>
          <Score value={mine ?? rec?.predicted ?? null} size="lg" muted={mine === undefined} />
          <Txt v="meta" tone="ink3">
            {mine !== undefined ? `#${kindRank + 1} of ${state.rankings[place.kind].length}` : 'for you'}
          </Txt>
        </View>
      </View>
      {scoresHere.length ? (
        <View style={{ marginTop: space.md }}>
          {BINS.map((b) => {
            const n = scoresHere.filter((s) => s >= b.lo && s < b.hi).length;
            return (
              <View key={b.label} style={styles.binRow}>
                <Txt v="meta" tone="ink3" style={{ width: 44 }}>
                  {b.label}
                </Txt>
                <View style={{ flex: 1, height: 6, backgroundColor: c.raised }}>
                  <View style={{ width: `${(n / maxBin) * 100}%`, height: 6, backgroundColor: c.ink }} />
                </View>
                <Txt v="meta" tone="ink3" style={{ width: 24, textAlign: 'right' }}>
                  {n}
                </Txt>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button style={{ flex: 1 }} label={mine !== undefined ? 'Log again' : 'Log a visit'} onPress={() => router.push({ pathname: '/log', params: { placeId: id } })} />
        {mine === undefined ? (
          <Button style={{ flex: 1 }} kind="secondary" label={inWant ? 'On want-to-go' : 'Want to go'} onPress={() => dispatch({ type: 'toggleWant', placeId: id })} />
        ) : null}
      </View>
      <View style={{ marginTop: space.md }}>
        <TextAction label="Add to a list" onPress={() => router.push({ pathname: '/save/[id]', params: { id } })} />
      </View>

      {rec ? (
        <>
          <SectionLabel>Why Thoq thinks you’d like it</SectionLabel>
          {rec.reasons.map((r) => (
            <View key={r} style={{ flexDirection: 'row', marginBottom: space.xs }}>
              <Txt v="small" tone="ink3" style={{ width: 16 }}>
                —
              </Txt>
              <Txt v="small" tone="ink2" style={{ flex: 1 }}>
                {r}
              </Txt>
            </View>
          ))}
        </>
      ) : null}

      <SectionLabel>Known for</SectionLabel>
      <Txt v="body" tone="ink2">
        {place.tags.map((t) => TAG_LABEL[t] ?? t).join(' · ')}
      </Txt>

      {orders.length ? (
        <>
          <SectionLabel right={<Txt v="meta" tone="ink3">ORDERS</Txt>}>What people get</SectionLabel>
          <Rule />
          {orders.map(([item, n]) => (
            <View key={item} style={[styles.orderRow, { borderBottomColor: c.rule }]}>
              <Txt v="body">{item}</Txt>
              <Txt v="meta" tone="ink3">
                {n}
              </Txt>
            </View>
          ))}
        </>
      ) : null}

      <SectionLabel right={<Txt v="meta" tone="ink3">{visits.length}</Txt>}>Visits</SectionLabel>
      <Rule />
      {visits.length === 0 ? (
        <Txt v="small" tone="ink2" style={{ marginTop: space.md }}>
          No one has logged a visit yet. Be the first.
        </Txt>
      ) : null}
      {visits.slice(0, 12).map((v) => {
        const theirs = everyone.find((n) => n.userId === v.userId)?.scores[id];
        const match = v.userId === ME ? null : tasteMatch(myScores, everyone.find((n) => n.userId === v.userId)?.scores ?? {});
        return (
          <Pressable
            key={v.id}
            onPress={() => router.push(v.userId === ME ? '/you' : { pathname: '/user/[id]', params: { id: v.userId } })}
            style={({ pressed }) => [styles.visit, { borderBottomColor: c.rule, opacity: pressed ? 0.6 : 1 }]}>
            <View style={styles.visitHead}>
              <Txt v="bodyStrong">
                {v.userId === ME ? 'You' : userName(v.userId)}
                {match ? (
                  <Txt v="meta" tone="ink3">
                    {'  '}
                    {match.percent}% match
                  </Txt>
                ) : null}
              </Txt>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
                <Txt v="meta" tone="ink3">
                  {shortDate(v.date)}
                </Txt>
                <Score value={theirs ?? null} />
              </View>
            </View>
            {v.note ? (
              <Txt v="body" tone="ink2" style={{ marginTop: space.xs }}>
                {v.note}
              </Txt>
            ) : null}
            {v.ordered.length ? (
              <Txt v="meta" tone="ink3" style={{ marginTop: space.xs }}>
                HAD: {v.ordered.join(', ')}
              </Txt>
            ) : null}
          </Pressable>
        );
      })}

      <SectionLabel>Similar places</SectionLabel>
      <Rule />
      {similarPlaces(place, PLACES).map((p) => (
        <PlaceRow key={p.id} place={p} score={myScores[p.id] ?? crowd[p.id]?.avg ?? null} scoreCaption={myScores[p.id] !== undefined ? 'yours' : undefined} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { borderLeftWidth: 2, paddingLeft: space.md, paddingVertical: space.sm, marginBottom: space.xl },
  scores: { flexDirection: 'row', marginTop: space.xl, paddingVertical: space.lg, borderTopWidth: 1.5, borderBottomWidth: StyleSheet.hairlineWidth },
  youCol: { flex: 2, borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: space.lg },
  binRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  visit: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  visitHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
