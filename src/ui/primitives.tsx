import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GUTTER, inputReset, radius, space, type, type TypeVariant } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';

type Tone = 'ink' | 'ink2' | 'ink3' | 'accent' | 'onInk';

export function Txt({
  v = 'body',
  tone = 'ink',
  style,
  children,
  numberOfLines,
  onPress,
}: {
  v?: TypeVariant;
  tone?: Tone;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
  onPress?: () => void;
}) {
  const c = usePalette();
  return (
    <Text
      numberOfLines={numberOfLines}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      suppressHighlighting
      style={[type[v], { color: c[tone] }, style]}>
      {children}
    </Text>
  );
}

export function Rule({ style, strong }: { style?: StyleProp<ViewStyle>; strong?: boolean }) {
  const c = usePalette();
  return <View style={[{ height: strong ? 1.5 : StyleSheet.hairlineWidth, backgroundColor: strong ? c.ink : c.rule }, style]} />;
}

/** Scrolling page with the gutter applied. Tab screens pass `tabbed` to leave room for the bar. */
export function Screen({ children, scroll = true, footer }: { children: ReactNode; scroll?: boolean; footer?: ReactNode }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: space.xxxl, paddingHorizontal: GUTTER }}
      keyboardShouldPersistTaps="handled">
      <View style={styles.column}>{children}</View>
    </ScrollView>
  ) : (
    <View style={{ flex: 1, paddingTop: insets.top + space.lg, paddingHorizontal: GUTTER }}>
      <View style={[styles.column, { flex: 1 }]}>{children}</View>
    </View>
  );
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {body}
      {footer ? (
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.rule, backgroundColor: c.paper, paddingHorizontal: GUTTER, paddingTop: space.md, paddingBottom: insets.bottom + space.md }}>
          <View style={styles.column}>{footer}</View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** Left-aligned page header: small mono eyebrow, serif title, optional note. */
export function PageHead({ eyebrow, title, note, right }: { eyebrow?: string; title: string; note?: string; right?: ReactNode }) {
  return (
    <View style={{ marginBottom: space.xl }}>
      {eyebrow ? (
        <Txt v="meta" tone="ink3" style={{ marginBottom: space.sm }}>
          {eyebrow}
        </Txt>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md }}>
        <Txt v="display" style={{ flexShrink: 1 }}>
          {title}
        </Txt>
        {right}
      </View>
      {note ? (
        <Txt v="body" tone="ink2" style={{ marginTop: space.sm, maxWidth: 520 }}>
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: space.xxl, marginBottom: space.sm }}>
      <Txt v="label" tone="ink2">
        {children}
      </Txt>
      {right}
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = usePalette();
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: c.ink } : { borderWidth: 1, borderColor: c.ink },
        pressed && { opacity: 0.75 },
        disabled && { opacity: 0.35 },
        style,
      ]}>
      <Txt v="bodyStrong" tone={primary ? 'onInk' : 'ink'}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Inline text action. Accent colour, underlined — the only link style. */
export function TextAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      {({ pressed }) => (
        <Txt v="small" tone="accent" style={{ textDecorationLine: 'underline', opacity: pressed ? 0.6 : 1 }}>
          {label}
        </Txt>
      )}
    </Pressable>
  );
}

/** Square-cornered toggle for tags and filters. Selected = ink fill. */
export function Choice({ label, selected, onPress, detail }: { label: string; selected: boolean; onPress: () => void; detail?: string }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        { borderColor: selected ? c.ink : c.rule, backgroundColor: selected ? c.ink : pressed ? c.raised : 'transparent' },
      ]}>
      <Txt v="small" tone={selected ? 'onInk' : 'ink'}>
        {label}
      </Txt>
      {detail ? (
        <Txt v="meta" tone={selected ? 'onInk' : 'ink3'} style={{ marginLeft: space.xs }}>
          {detail}
        </Txt>
      ) : null}
    </Pressable>
  );
}

/** Text tabs with an accent underline on the active item. */
export function Segmented<T extends string>({ items, value, onChange }: { items: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', gap: space.xl, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.rule }}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <Pressable key={it.value} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(it.value)} style={{ paddingBottom: space.sm }}>
            <Txt v="bodyStrong" tone={active ? 'ink' : 'ink3'}>
              {it.label}
            </Txt>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: -StyleSheet.hairlineWidth, height: 2, backgroundColor: active ? c.accent : 'transparent' }} />
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const c = usePalette();
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: space.lg }}>
      <Txt v="label" tone="ink2" style={{ marginBottom: space.xs }}>
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={c.ink3}
        {...rest}
        style={[type.body, inputReset, { color: c.ink, borderBottomWidth: 1, borderBottomColor: c.ink, paddingVertical: space.sm }, style]}
      />
    </View>
  );
}

export function BackBar({ label = 'Back', right }: { label?: string; right?: ReactNode }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.xl }}>
      <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
        {({ pressed }) => (
          <Txt v="bodyStrong" style={{ opacity: pressed ? 0.5 : 1 }}>
            ← {label}
          </Txt>
        )}
      </Pressable>
      {right}
    </View>
  );
}

/** A score on the 0–10 scale. Only exceptional scores (9+) take the accent, so it keeps meaning something. */
export function Score({ value, size = 'md', muted }: { value: number | null | undefined; size?: 'md' | 'lg' | 'xl'; muted?: boolean }) {
  const c = usePalette();
  const fontSize = size === 'xl' ? 44 : size === 'lg' ? 24 : 15;
  const color = value == null ? c.ink3 : muted ? c.ink2 : value >= 9 ? c.accent : c.ink;
  return (
    <Text style={[type.numeral, { fontSize, lineHeight: fontSize * 1.15, color, letterSpacing: size === 'xl' ? -1 : 0 }]}>
      {value == null ? '—' : value.toFixed(1)}
    </Text>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  button: { minHeight: 48, paddingHorizontal: space.xl, borderRadius: radius, alignItems: 'center', justifyContent: 'center' },
  choice: { flexDirection: 'row', alignItems: 'baseline', borderWidth: 1, borderRadius: radius, paddingHorizontal: space.md, paddingVertical: space.sm },
});
