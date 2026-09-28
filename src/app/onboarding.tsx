import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { riyadhToday } from '@/domain/clock';
import { PLACES } from '@/domain/seed-places';
import type { PriceLevel } from '@/domain/types';
import { AREAS, PRICE_LABEL, TAG_GROUPS } from '@/domain/vocabulary';
import { useStore } from '@/store/provider';
import { radius, space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { placeMeta } from '@/ui/place-row';
import { Button, Choice, Field, Rule, Screen, SectionLabel, Segmented, TextAction, Txt } from '@/ui/primitives';

const STEPS = 4;
const MAX_LOVED = 5;

/** Tap once for yes, again for no, again to clear. */
function TriChoice({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const c = usePalette();
  const next = value === 0 ? 1 : value === 1 ? -1 : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value === 1 ? 'yes' : value === -1 ? 'no' : 'no opinion'}`}
      onPress={() => onChange(next)}
      style={({ pressed }) => [
        styles.tri,
        {
          borderColor: value === 0 ? c.rule : c.ink,
          backgroundColor: value === 1 ? c.ink : pressed ? c.raised : 'transparent',
        },
      ]}>
      <Txt v="small" tone={value === 1 ? 'onInk' : value === -1 ? 'ink3' : 'ink'} style={value === -1 ? { textDecorationLine: 'line-through' } : undefined}>
        {label}
      </Txt>
    </Pressable>
  );
}

export default function Onboarding() {
  const { dispatch } = useStore();
  const router = useRouter();
  const c = usePalette();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [area, setArea] = useState('Al Olaya');
  const [prefs, setPrefs] = useState<Record<string, number>>({});
  const [maxPrice, setMaxPrice] = useState<PriceLevel | null>(null);
  const [loved, setLoved] = useState<string[]>([]);
  const [lovedKind, setLovedKind] = useState<'cafe' | 'restaurant'>('cafe');

  const yes = Object.values(prefs).filter((v) => v > 0).length;
  const canNext = step === 1 ? name.trim().length > 0 : step === 2 ? yes >= 3 : true;

  const finish = () => {
    const cleanPrefs = Object.fromEntries(Object.entries(prefs).filter(([, v]) => v !== 0));
    dispatch({
      type: 'onboard',
      me: { name: name.trim(), handle: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'me', area },
      prefs: cleanPrefs,
      maxPrice,
      loved,
      today: riyadhToday(new Date()),
    });
    router.replace('/');
  };

  const footer = (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      {step > 1 ? <Button kind="secondary" label="Back" onPress={() => setStep(step - 1)} /> : null}
      <Button
        style={{ flex: 1 }}
        label={step < STEPS ? 'Continue' : loved.length ? 'Start with these' : 'Skip for now'}
        disabled={!canNext}
        onPress={() => (step < STEPS ? setStep(step + 1) : finish())}
      />
    </View>
  );

  return (
    <Screen footer={footer}>
      <Txt v="meta" tone="ink3">
        {String(step).padStart(2, '0')} / {String(STEPS).padStart(2, '0')}
      </Txt>
      <Rule strong style={{ marginTop: space.sm, marginBottom: space.xl, width: `${(step / STEPS) * 100}%` }} />

      {step === 1 && (
        <>
          <Txt v="display">Thoq keeps score of where you eat and drink.</Txt>
          <Txt v="body" tone="ink2" style={{ marginTop: space.md, marginBottom: space.xxl }}>
            Log a visit, compare it against places you already know, and Thoq learns your taste well enough to pick
            tonight’s coffee for you.
          </Txt>
          <Field label="What should we call you" value={name} onChangeText={setName} placeholder="First name" autoFocus autoCapitalize="words" returnKeyType="next" />
          <SectionLabel>Where you usually start from</SectionLabel>
          <View style={styles.wrap}>
            {AREAS.map((a) => (
              <Choice key={a.name} label={a.name} selected={area === a.name} onPress={() => setArea(a.name)} />
            ))}
          </View>
          <Txt v="small" tone="ink3" style={{ marginTop: space.sm }}>
            Used for distance only. Change it any time from the For you screen.
          </Txt>
        </>
      )}

      {step === 2 && (
        <>
          <Txt v="title">What do you go out for?</Txt>
          <Txt v="body" tone="ink2" style={{ marginTop: space.sm }}>
            Tap once for yes, twice for “not for me”. Pick at least three. This only seeds your profile; your logged
            visits take over quickly.
          </Txt>
          {TAG_GROUPS.map((g) => (
            <View key={g.id}>
              <SectionLabel>{g.title}</SectionLabel>
              <View style={styles.wrap}>
                {g.tags.map((t) => (
                  <TriChoice key={t.id} label={t.label} value={prefs[t.id] ?? 0} onChange={(v) => setPrefs({ ...prefs, [t.id]: v })} />
                ))}
              </View>
            </View>
          ))}
          <Txt v="meta" tone={yes >= 3 ? 'ink3' : 'accent'} style={{ marginTop: space.lg }}>
            {yes} selected{yes < 3 ? ` · ${3 - yes} more to continue` : ''}
          </Txt>
        </>
      )}

      {step === 3 && (
        <>
          <Txt v="title">Usual spend per person</Txt>
          <Txt v="body" tone="ink2" style={{ marginTop: space.sm, marginBottom: space.xl }}>
            Recommendations above this are hidden by default. You can lift it for a single search.
          </Txt>
          {([1, 2, 3, 4] as PriceLevel[]).map((p) => (
            <Pressable key={p} onPress={() => setMaxPrice(p)} style={[styles.radioRow, { borderBottomColor: c.rule }]}>
              <Txt v="numeral">SAR {PRICE_LABEL[p]}</Txt>
              <Txt v="meta" tone={maxPrice === p ? 'accent' : 'ink3'}>
                {maxPrice === p ? 'SELECTED' : ''}
              </Txt>
            </Pressable>
          ))}
          <Pressable onPress={() => setMaxPrice(null)} style={[styles.radioRow, { borderBottomColor: c.rule }]}>
            <Txt v="bodyStrong">No limit</Txt>
            <Txt v="meta" tone={maxPrice === null ? 'accent' : 'ink3'}>
              {maxPrice === null ? 'SELECTED' : ''}
            </Txt>
          </Pressable>
        </>
      )}

      {step === 4 && (
        <>
          <Txt v="title">Places you already love</Txt>
          <Txt v="body" tone="ink2" style={{ marginTop: space.sm, marginBottom: space.xl }}>
            Pick up to {MAX_LOVED}, best first. They become the top of your rankings, and new visits get compared
            against them.
          </Txt>
          <Segmented
            items={[
              { value: 'cafe', label: 'Cafés' },
              { value: 'restaurant', label: 'Restaurants' },
            ]}
            value={lovedKind}
            onChange={setLovedKind}
          />
          {PLACES.filter((p) => p.kind === lovedKind).map((p) => {
            const idx = loved.indexOf(p.id);
            const full = loved.length >= MAX_LOVED && idx < 0;
            return (
              <Pressable
                key={p.id}
                disabled={full}
                onPress={() => setLoved(idx >= 0 ? loved.filter((id) => id !== p.id) : [...loved, p.id])}
                style={({ pressed }) => [styles.pickRow, { borderBottomColor: c.rule, opacity: full ? 0.4 : 1 }, pressed && { opacity: 0.6 }]}>
                <View style={{ flex: 1 }}>
                  <Txt v="bodyStrong">{p.name}</Txt>
                  <Txt v="meta" tone="ink3">
                    {placeMeta(p)}
                  </Txt>
                </View>
                <Txt v="numeral" tone={idx >= 0 ? 'accent' : 'ink3'} style={{ width: 32, textAlign: 'right' }}>
                  {idx >= 0 ? `#${idx + 1}` : '—'}
                </Txt>
              </Pressable>
            );
          })}
          {loved.length ? (
            <View style={{ marginTop: space.lg }}>
              <TextAction label="Clear picks" onPress={() => setLoved([])} />
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tri: { borderWidth: 1, borderRadius: radius, paddingHorizontal: space.md, paddingVertical: space.sm },
  radioRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  pickRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
});
