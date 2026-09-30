import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { PLACES } from '@/domain/seed-places';
import type { PriceLevel, Reaction } from '@/domain/types';
import { PRICE_LABEL, TAG_GROUPS } from '@/domain/vocabulary';
import type { RankEntry } from '@/reco/ranking';
import { useStore } from '@/store/provider';
import { reactionLabel, type Account, type Origin } from '@/store/state';
import { font, inputReset, radius, space, type } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { OriginPicker } from '@/ui/origin-picker';
import { placeMeta } from '@/ui/place-row';
import { Button, Field, Rule, Screen, SectionLabel, TextAction, ToggleTabs, Txt } from '@/ui/primitives';

const STEPS = 6;

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
        { borderColor: value === 0 ? c.rule : c.ink, backgroundColor: value === 1 ? c.ink : pressed ? c.raised : 'transparent' },
      ]}>
      <Txt v="small" tone={value === 1 ? 'onInk' : value === -1 ? 'ink3' : 'ink'} style={value === -1 ? { textDecorationLine: 'line-through' } : undefined}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Saudi mobile numbers: 5XXXXXXXX after +966 (a leading 0 is accepted and dropped). */
function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^966/, '').replace(/^0/, '');
  return /^5\d{8}$/.test(digits) ? `+966${digits}` : null;
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export default function Onboarding() {
  const { dispatch } = useStore();
  const router = useRouter();
  const c = usePalette();
  const [step, setStep] = useState(1);

  // 1 — sign in
  const [method, setMethod] = useState<Account['method']>('phone');
  const [contact, setContact] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  // 2–6
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [prefs, setPrefs] = useState<Record<string, number>>({});
  const [maxPrice, setMaxPrice] = useState<PriceLevel | null>(null);
  const [been, setBeen] = useState<RankEntry[]>([]);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'cafe' | 'restaurant' | null>(null);

  const account: Account | null =
    method === 'phone' ? (normalisePhone(contact) ? { method, value: normalisePhone(contact)! } : null) : isEmail(contact) ? { method, value: contact.trim() } : null;
  const yes = Object.values(prefs).filter((v) => v > 0).length;

  const canNext =
    step === 1 ? (codeSent ? /^\d{4}$/.test(code) : account !== null) : step === 2 ? name.trim().length > 0 : step === 3 ? origin !== null : step === 4 ? yes >= 3 : true;

  const finish = () => {
    dispatch({
      type: 'onboard',
      me: { name: name.trim(), handle: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'me', account },
      origin: origin!,
      prefs: Object.fromEntries(Object.entries(prefs).filter(([, v]) => v !== 0)),
      maxPrice,
      been,
    });
    router.replace('/');
  };

  const next = () => {
    if (step === 1 && !codeSent) return setCodeSent(true);
    if (step < STEPS) return setStep(step + 1);
    finish();
  };
  const back = () => {
    if (step === 1 && codeSent) return setCodeSent(false);
    setStep(step - 1);
  };

  const setReaction = (placeId: string, reaction: Reaction) => {
    const current = been.find((e) => e.placeId === placeId);
    if (current?.reaction === reaction) setBeen(been.filter((e) => e.placeId !== placeId));
    else setBeen([...been.filter((e) => e.placeId !== placeId), { placeId, reaction }]);
  };

  const q = query.trim().toLowerCase();
  const matches = PLACES.filter(
    (p) => (!kind || p.kind === kind) && (!q || p.name.toLowerCase().includes(q) || p.area.toLowerCase().includes(q) || p.nameAr.includes(query.trim())),
  );

  const label =
    step === 1 ? (codeSent ? 'Verify' : 'Send code') : step < STEPS ? 'Continue' : been.length ? `Continue with ${been.length} place${been.length === 1 ? '' : 's'}` : 'Skip for now';

  const footer = (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      {step > 1 || codeSent ? <Button kind="secondary" label="Back" onPress={back} /> : null}
      <Button style={{ flex: 1 }} label={label} disabled={!canNext} onPress={next} />
    </View>
  );

  return (
    <Screen footer={footer}>
      <Txt v="meta" tone="ink3">
        {String(step).padStart(2, '0')} / {String(STEPS).padStart(2, '0')}
      </Txt>
      <Rule strong style={{ marginTop: space.sm, marginBottom: space.xl, width: `${(step / STEPS) * 100}%` }} />

      {step === 1 && !codeSent && (
        <>
          <Txt v="display">Thoq keeps score of where you eat and drink.</Txt>
          <Txt v="body" tone="ink2" style={{ marginTop: space.md, marginBottom: space.xxl }}>
            Log a visit, compare it with places you already know, and Thoq learns your taste well enough to pick
            where to go next.
          </Txt>
          {method === 'phone' ? (
            <>
              <Txt v="label" tone="ink2" style={{ marginBottom: space.xs }}>
                Mobile number
              </Txt>
              <View style={[styles.phoneRow, { borderBottomColor: c.ink }]}>
                <Txt v="numeral" tone="ink2">
                  +966
                </Txt>
                <TextInput
                  value={contact}
                  onChangeText={setContact}
                  placeholder="5X XXX XXXX"
                  placeholderTextColor={c.ink3}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  accessibilityLabel="Mobile number"
                  style={[type.numeral, inputReset, { flex: 1, color: c.ink, paddingVertical: space.sm }]}
                />
              </View>
            </>
          ) : (
            <Field
              label="Email"
              value={contact}
              onChangeText={setContact}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          )}
          <View style={{ marginTop: space.lg }}>
            <TextAction
              label={method === 'phone' ? 'Use email instead' : 'Use mobile number instead'}
              onPress={() => {
                setMethod(method === 'phone' ? 'email' : 'phone');
                setContact('');
              }}
            />
          </View>
        </>
      )}

      {step === 1 && codeSent && (
        <>
          <Txt v="title">Enter the code</Txt>
          <Txt v="body" tone="ink2" style={{ marginTop: space.sm, marginBottom: space.xl }}>
            Sent to {account?.value}.
          </Txt>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 4))}
            placeholder="0000"
            placeholderTextColor={c.ink3}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            accessibilityLabel="Verification code"
            style={[type.display, inputReset, { fontFamily: font.monoMedium, letterSpacing: 12, color: c.ink, borderBottomWidth: 1.5, borderBottomColor: c.ink, paddingVertical: space.sm }]}
          />
          <Txt v="small" tone="ink3" style={{ marginTop: space.md }}>
            Prototype: no message is sent yet. Any 4 digits will do.
          </Txt>
        </>
      )}

      {step === 2 && (
        <>
          <Txt v="title">What should we call you?</Txt>
          <View style={{ marginTop: space.xl }}>
            <Field label="Name" value={name} onChangeText={setName} placeholder="First name" autoFocus autoCapitalize="words" />
          </View>
        </>
      )}

      {step === 3 && (
        <>
          <Txt v="title">Where are you?</Txt>
          <Txt v="body" tone="ink2" style={{ marginTop: space.sm, marginBottom: space.xl }}>
            Used to show what’s near you and how far it is. You can change it any time.
          </Txt>
          <OriginPicker value={origin} onChange={setOrigin} />
        </>
      )}

      {step === 4 && (
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

      {step === 5 && (
        <>
          <Txt v="title">Usual spend per person</Txt>
          <Txt v="body" tone="ink2" style={{ marginTop: space.sm, marginBottom: space.xl }}>
            Recommendations above this are hidden by default. You can lift it for a single search.
          </Txt>
          {([1, 2, 3, 4, null] as (PriceLevel | null)[]).map((p) => (
            <Pressable key={String(p)} onPress={() => setMaxPrice(p)} style={[styles.radioRow, { borderBottomColor: c.rule }]}>
              <Txt v={p === null ? 'bodyStrong' : 'numeral'}>{p === null ? 'No limit' : `SAR ${PRICE_LABEL[p]}`}</Txt>
              <Txt v="meta" tone={maxPrice === p ? 'accent' : 'ink3'}>
                {maxPrice === p ? 'SELECTED' : ''}
              </Txt>
            </Pressable>
          ))}
        </>
      )}

      {step === 6 && (
        <>
          <Txt v="title">Places you’ve been</Txt>
          <Txt v="body" tone="ink2" style={{ marginTop: space.sm, marginBottom: space.lg }}>
            Add as many as you like. Just say how each one was; you’ll put them in order later, a few at a time.
          </Txt>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or area"
            placeholderTextColor={c.ink3}
            autoCorrect={false}
            accessibilityLabel="Search places you've been"
            style={[type.heading, inputReset, styles.search, { color: c.ink, borderBottomColor: c.ink }]}
          />
          <ToggleTabs
            items={[
              { value: 'cafe', label: 'Cafés' },
              { value: 'restaurant', label: 'Restaurants' },
            ]}
            value={kind}
            onChange={setKind}
          />
          {matches.map((p) => {
            const picked = been.find((e) => e.placeId === p.id);
            return (
              <View key={p.id} style={[styles.pickRow, { borderBottomColor: c.rule }]}>
                <Txt v="bodyStrong">{p.name}</Txt>
                <Txt v="meta" tone="ink3">
                  {placeMeta(p)}
                </Txt>
                <View style={[styles.wrap, { marginTop: space.sm }]}>
                  {(['loved', 'fine', 'disliked'] as Reaction[]).map((r) => {
                    const on = picked?.reaction === r;
                    return (
                      <Pressable
                        key={r}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`${p.name}: ${reactionLabel(r)}`}
                        onPress={() => setReaction(p.id, r)}
                        style={({ pressed }) => [styles.mini, { borderColor: on ? c.ink : c.rule, backgroundColor: on ? c.ink : pressed ? c.raised : 'transparent' }]}>
                        <Txt v="small" tone={on ? 'onInk' : 'ink2'}>
                          {reactionLabel(r)}
                        </Txt>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
          {matches.length === 0 ? (
            <Txt v="body" tone="ink2" style={{ marginTop: space.lg }}>
              Not on Thoq yet. You’ll be able to add missing places soon.
            </Txt>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tri: { borderWidth: 1, borderRadius: radius, paddingHorizontal: space.md, paddingVertical: space.sm },
  mini: { borderWidth: 1, borderRadius: radius, paddingHorizontal: space.sm, paddingVertical: space.xs },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderBottomWidth: 1 },
  radioRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  search: { borderBottomWidth: 1.5, paddingVertical: space.sm, marginBottom: space.lg },
  pickRow: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
});
