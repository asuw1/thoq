import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { partOfDay, riyadhStamp } from '@/domain/clock';
import { fmtKm, hoursStatus, riyadhMinutes } from '@/domain/geo';
import { PLACES } from '@/domain/seed-places';
import { AREAS, areaByName, PRICE_CAP } from '@/domain/vocabulary';
import { recommend, type Context } from '@/reco/engine';
import { useStore } from '@/store/provider';
import { space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { placeMeta, PlaceRow } from '@/ui/place-row';
import { Choice, Rule, Score, Screen, SectionLabel, Segmented, TextAction, Txt } from '@/ui/primitives';

type Mode = 'cafe' | 'restaurant' | 'any';

export default function ForYou() {
  const { state, dispatch, myScores, neighbours } = useStore();
  const router = useRouter();
  const c = usePalette();
  const [mode, setMode] = useState<Mode>('cafe');
  const [openNow, setOpenNow] = useState(true);
  const [near, setNear] = useState(false);
  const [capPrice, setCapPrice] = useState(state.maxPrice !== null);
  const [pickingArea, setPickingArea] = useState(false);

  const now = new Date();
  const minutes = riyadhMinutes(now);
  const area = areaByName(state.me.area);

  // The React Compiler memoises this; no manual useMemo needed.
  const ctx: Context = {
    kind: mode,
    origin: { lat: area.lat, lng: area.lng, name: area.name },
    nowMinutes: minutes,
    openNow,
    maxPrice: capPrice ? state.maxPrice : null,
    maxKm: near ? 5 : null,
  };
  const recs = recommend(PLACES, { prefs: state.prefs, scores: myScores, wantToGo: state.wantToGo }, neighbours, ctx, 12);

  const [top, ...rest] = recs;
  const ranked = Object.keys(myScores).length;

  return (
    <Screen>
      <View style={styles.eyebrow}>
        <Txt v="meta" tone="ink3">
          {riyadhStamp(now)} · FROM {area.name.toUpperCase()}
        </Txt>
        <TextAction label={pickingArea ? 'Done' : 'Change'} onPress={() => setPickingArea(!pickingArea)} />
      </View>
      {pickingArea ? (
        <View style={[styles.wrap, { marginBottom: space.lg }]}>
          {AREAS.map((a) => (
            <Choice
              key={a.name}
              label={a.name}
              selected={a.name === area.name}
              onPress={() => {
                dispatch({ type: 'setArea', area: a.name });
                setPickingArea(false);
              }}
            />
          ))}
        </View>
      ) : null}

      <Txt v="display" style={{ marginBottom: space.lg }}>
        {partOfDay(minutes)}
      </Txt>

      <Segmented
        items={[
          { value: 'cafe', label: 'Coffee' },
          { value: 'restaurant', label: 'Food' },
          { value: 'any', label: 'Either' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <View style={[styles.wrap, { marginTop: space.md }]}>
        <Choice label="Open now" selected={openNow} onPress={() => setOpenNow(!openNow)} />
        <Choice label="Within 5 km" selected={near} onPress={() => setNear(!near)} />
        {state.maxPrice !== null ? (
          <Choice label="Budget" detail={PRICE_CAP[state.maxPrice]} selected={capPrice} onPress={() => setCapPrice(!capPrice)} />
        ) : null}
      </View>

      {top ? (
        <>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/place/[id]', params: { id: top.place.id } })}
            style={({ pressed }) => [styles.feature, { opacity: pressed ? 0.7 : 1 }]}>
            <View style={styles.featureTop}>
              <View style={{ flex: 1 }}>
                <Txt v="label" tone="accent">
                  Top pick
                </Txt>
                <Txt v="title" style={{ marginTop: space.sm }}>
                  {top.place.name}
                </Txt>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Score value={top.predicted} size="xl" />
                <Txt v="meta" tone="ink3">
                  predicted
                </Txt>
              </View>
            </View>
            <Txt v="meta" tone="ink3" style={{ marginTop: space.xs }}>
              {placeMeta(top.place)}
            </Txt>
            <Txt v="meta" tone="ink3">
              {hoursStatus(top.place.hours, minutes)} · {fmtKm(top.km)}
            </Txt>
            <Rule style={{ marginVertical: space.md }} />
            {top.reasons.map((r) => (
              <View key={r} style={styles.reason}>
                <Txt v="small" tone="ink3" style={{ width: 16 }}>
                  —
                </Txt>
                <Txt v="small" tone="ink2" style={{ flex: 1 }}>
                  {r}
                </Txt>
              </View>
            ))}
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
              <SectionLabel right={<Txt v="meta" tone="ink3">PREDICTED</Txt>}>Also worth it</SectionLabel>
              <Rule />
              {rest.map((r, i) => (
                <PlaceRow key={r.place.id} place={r.place} rank={i + 2} score={r.predicted} note={r.reasons[0]} />
              ))}
            </>
          ) : null}
        </>
      ) : (
        <View style={{ marginTop: space.xxl }}>
          <Txt v="heading">Nothing matches right now.</Txt>
          <Txt v="body" tone="ink2" style={{ marginTop: space.sm }}>
            {openNow ? 'Most places here open later in the day. ' : ''}Try loosening a filter.
          </Txt>
          <View style={{ flexDirection: 'row', gap: space.lg, marginTop: space.md }}>
            {openNow ? <TextAction label="Show closed places" onPress={() => setOpenNow(false)} /> : null}
            {near ? <TextAction label="Any distance" onPress={() => setNear(false)} /> : null}
          </View>
        </View>
      )}

      <View style={[styles.how, { borderColor: c.rule }]}>
        <Txt v="label" tone="ink2">
          How these are picked
        </Txt>
        <Txt v="small" tone="ink2" style={{ marginTop: space.sm }}>
          {ranked === 0
            ? 'Right now from your onboarding answers and what people nearby rank highly. '
            : `From your ${ranked} ranked place${ranked === 1 ? '' : 's'}, people whose scores agree with yours, and the community average. `}
          Predicted scores use the same 0–10 scale you rank on. Places you’ve already ranked are left out.
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  feature: { marginTop: space.xxl },
  featureTop: { flexDirection: 'row', alignItems: 'flex-end', gap: space.lg },
  reason: { flexDirection: 'row', marginBottom: space.xs },
  how: { marginTop: space.xxxl, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.lg },
});
