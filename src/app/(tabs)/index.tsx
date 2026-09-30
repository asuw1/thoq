import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { riyadhStamp } from '@/domain/clock';
import { fmtKm, fmtTime, hoursStatus, riyadhMinutes } from '@/domain/geo';
import { PLACES } from '@/domain/seed-places';
import { PRICE_CAP } from '@/domain/vocabulary';
import { recommend, type Context, type Rec } from '@/reco/engine';
import { useStore } from '@/store/provider';
import { GUTTER, space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { OriginPicker } from '@/ui/origin-picker';
import { placeMeta, PlaceRow } from '@/ui/place-row';
import { Choice, Panel, Rule, Score, Screen, SectionLabel, TextAction, ToggleTabs, Txt } from '@/ui/primitives';

type When = { kind: 'now' } | { kind: 'tonight' } | { kind: 'at'; minutes: number };

/** Places opening within this window still count as "now", shown with their opening time. */
const OPENING_SOON_MIN = 90;
const TONIGHT = 21 * 60;
/** 06:00 through 03:00, the hours people actually go out. */
const HOURS = Array.from({ length: 22 }, (_, i) => ((6 + i) % 24) * 60);

function ratingCaption(cr: { count: number } | undefined): string {
  return cr ? `${cr.count} rating${cr.count === 1 ? '' : 's'}` : 'new';
}

function openingNote(r: Rec): string | null {
  return r.opensIn > 0 ? `Opens ${fmtTime(r.place.hours.open)}` : null;
}

export default function ForYou() {
  const { state, dispatch, learnScores, neighbours, crowd } = useStore();
  const router = useRouter();
  const c = usePalette();
  const [kind, setKind] = useState<'cafe' | 'restaurant' | null>(null);
  const [when, setWhen] = useState<When>({ kind: 'now' });
  const [pickingTime, setPickingTime] = useState(false);
  const [near, setNear] = useState(false);
  const [capPrice, setCapPrice] = useState(state.maxPrice !== null);
  const [pickingOrigin, setPickingOrigin] = useState(false);

  const now = new Date();
  const minutes = riyadhMinutes(now);
  const openAt = when.kind === 'now' ? minutes : when.kind === 'tonight' ? TONIGHT : when.minutes;
  const origin = state.origin;

  // The React Compiler memoises this; no manual useMemo needed.
  const ctx: Context = {
    kind: kind ?? 'any',
    origin: { lat: origin.lat, lng: origin.lng, name: origin.source === 'gps' ? 'you' : origin.label },
    openAt,
    openingSoonMin: when.kind === 'now' ? OPENING_SOON_MIN : 0,
    maxPrice: capPrice ? state.maxPrice : null,
    maxKm: near ? 5 : null,
  };
  const recs = recommend(PLACES, { prefs: state.prefs, scores: learnScores, wantToGo: state.wantToGo }, neighbours, ctx, 12);
  const [top, ...rest] = recs;
  const title = when.kind === 'now' ? 'Right now' : when.kind === 'tonight' ? 'Tonight' : `At ${fmtTime(when.minutes)}`;
  const toRank = state.unranked.length;

  return (
    <Screen>
      <View style={styles.eyebrow}>
        <Txt v="meta" tone="ink3" style={{ flex: 1 }} numberOfLines={1}>
          {riyadhStamp(now)} · {origin.source === 'gps' ? origin.label.toUpperCase() : `FROM ${origin.label.toUpperCase()}`}
        </Txt>
        <TextAction label={pickingOrigin ? 'Done' : 'Change'} onPress={() => setPickingOrigin(!pickingOrigin)} />
      </View>
      {pickingOrigin ? (
        <View style={{ marginBottom: space.lg }}>
          <OriginPicker
            value={origin}
            onChange={(o) => {
              dispatch({ type: 'setOrigin', origin: o });
              setPickingOrigin(false);
            }}
          />
        </View>
      ) : null}

      <Txt v="display" style={{ marginBottom: space.lg }}>
        {title}
      </Txt>

      <ToggleTabs
        items={[
          { value: 'cafe', label: 'Coffee' },
          { value: 'restaurant', label: 'Food' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <View style={[styles.wrap, { marginTop: space.md }]}>
        <Choice label="Now" selected={when.kind === 'now'} onPress={() => { setWhen({ kind: 'now' }); setPickingTime(false); }} />
        <Choice label="Tonight" selected={when.kind === 'tonight'} onPress={() => { setWhen({ kind: 'tonight' }); setPickingTime(false); }} />
        <Choice
          label={when.kind === 'at' ? fmtTime(when.minutes) : 'Pick a time'}
          selected={when.kind === 'at'}
          onPress={() => setPickingTime(!pickingTime)}
        />
        <Choice label="Within 5 km" selected={near} onPress={() => setNear(!near)} />
        {state.maxPrice !== null ? <Choice label="Budget" detail={PRICE_CAP[state.maxPrice]} selected={capPrice} onPress={() => setCapPrice(!capPrice)} /> : null}
      </View>
      {pickingTime ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.sm, marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: GUTTER }}>
          {HOURS.map((m) => (
            <Choice
              key={m}
              label={fmtTime(m)}
              selected={when.kind === 'at' && when.minutes === m}
              onPress={() => {
                setWhen({ kind: 'at', minutes: m });
                setPickingTime(false);
              }}
            />
          ))}
        </ScrollView>
      ) : null}

      {toRank > 0 ? (
        <View style={[styles.rankPrompt, { borderColor: c.rule }]}>
          <Txt v="small" tone="ink2" style={{ flex: 1 }}>
            {toRank} place{toRank === 1 ? '' : 's'} you’ve been to {toRank === 1 ? 'isn’t' : 'aren’t'} ranked yet. Ranking sharpens these picks.
          </Txt>
          <TextAction label={`Rank ${Math.min(3, toRank)}`} onPress={() => router.push({ pathname: '/compare', params: { batch: String(Math.min(3, toRank)) } })} />
        </View>
      ) : null}

      {top ? (
        <>
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/place/[id]', params: { id: top.place.id } })} style={({ pressed }) => [{ marginTop: space.xl, opacity: pressed ? 0.8 : 1 }]}>
            <Panel crenellated>
              <View style={styles.featureTop}>
                <View style={{ flex: 1 }}>
                  <Txt v="label" tone="olive">
                    Top pick for you
                  </Txt>
                  <Txt v="title" style={{ marginTop: space.sm }}>
                    {top.place.name}
                  </Txt>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Score value={crowd[top.place.id]?.avg ?? null} size="xl" />
                  <Txt v="meta" tone="ink2">
                    {ratingCaption(crowd[top.place.id])}
                  </Txt>
                </View>
              </View>
              <Txt v="meta" tone="ink2" style={{ marginTop: space.xs }}>
                {placeMeta(top.place)}
              </Txt>
              <Txt v="meta" tone={top.opensIn > 0 ? 'accent' : 'ink2'}>
                {hoursStatus(top.place.hours, openAt)} · {fmtKm(top.km)}
              </Txt>
              <View style={[styles.reasons, { borderTopColor: c.rule }]}>
                {top.reasons.map((r) => (
                  <View key={r} style={styles.reason}>
                    <Txt v="small" tone="olive" style={{ width: 16 }}>
                      —
                    </Txt>
                    <Txt v="small" tone="ink2" style={{ flex: 1 }}>
                      {r}
                    </Txt>
                  </View>
                ))}
              </View>
            </Panel>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: space.lg, marginTop: space.md }}>
            <TextAction
              label={state.wantToGo.includes(top.place.id) ? 'On want-to-go' : 'Add to want-to-go'}
              onPress={() => dispatch({ type: 'toggleWant', placeId: top.place.id })}
            />
            <TextAction label="Been here? Log it" onPress={() => router.push({ pathname: '/log', params: { placeId: top.place.id } })} />
          </View>

          {rest.length ? (
            <>
              <SectionLabel right={<Txt v="meta" tone="ink3">AVG RATING</Txt>}>Also worth it</SectionLabel>
              <Rule />
              {rest.map((r, i) => (
                <PlaceRow
                  key={r.place.id}
                  place={r.place}
                  rank={i + 2}
                  score={crowd[r.place.id]?.avg ?? null}
                  scoreCaption={ratingCaption(crowd[r.place.id])}
                  note={[openingNote(r), r.reasons[0]].filter(Boolean).join(' · ')}
                />
              ))}
            </>
          ) : null}
        </>
      ) : (
        <View style={{ marginTop: space.xxl }}>
          <Txt v="heading">Nothing fits right now.</Txt>
          <Txt v="body" tone="ink2" style={{ marginTop: space.sm }}>
            Try a different time or loosen a filter.
          </Txt>
          <View style={{ flexDirection: 'row', gap: space.lg, marginTop: space.md }}>
            {when.kind !== 'tonight' ? <TextAction label="Show tonight" onPress={() => setWhen({ kind: 'tonight' })} /> : null}
            {near ? <TextAction label="Any distance" onPress={() => setNear(false)} /> : null}
          </View>
        </View>
      )}

      <View style={[styles.how, { borderColor: c.rule }]}>
        <Txt v="label" tone="ink2">
          How these are picked
        </Txt>
        <Txt v="small" tone="ink2" style={{ marginTop: space.sm }}>
          From the places you’ve been, people whose taste is close to yours, and what the community rates highly. Places
          you’ve already been to are left out. The number shown is the community’s average rating.
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md, marginBottom: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  rankPrompt: { flexDirection: 'row', alignItems: 'baseline', gap: space.md, marginTop: space.lg, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  featureTop: { flexDirection: 'row', alignItems: 'flex-end', gap: space.lg },
  reasons: { marginTop: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  reason: { flexDirection: 'row', marginBottom: space.xs },
  how: { marginTop: space.xxxl, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.lg },
});
