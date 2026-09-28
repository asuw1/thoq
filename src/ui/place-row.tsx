import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Place } from '../domain/types';
import { PRICE_LABEL } from '../domain/vocabulary';
import { space } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { Score, Txt } from './primitives';

export function placeMeta(p: Place): string {
  return `${p.category} · ${p.area} · SAR ${PRICE_LABEL[p.price]}`;
}

/**
 * The one list row used everywhere: optional rank numeral, serif name,
 * mono metadata, score on the right. Hairline below, no card.
 */
export function PlaceRow({
  place,
  rank,
  score,
  scoreCaption,
  note,
  onPress,
  right,
}: {
  place: Place;
  rank?: number;
  score?: number | null;
  scoreCaption?: string;
  note?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  const c = usePalette();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress ?? (() => router.push({ pathname: '/place/[id]', params: { id: place.id } }))}
      style={({ pressed }) => [styles.row, { borderBottomColor: c.rule, backgroundColor: pressed ? c.raised : 'transparent' }]}>
      {rank !== undefined ? (
        <Txt v="meta" tone="ink3" style={styles.rank}>
          {String(rank).padStart(2, '0')}
        </Txt>
      ) : null}
      <View style={{ flex: 1 }}>
        <Txt v="heading" numberOfLines={1}>
          {place.name}
        </Txt>
        <Txt v="meta" tone="ink3" style={{ marginTop: 2 }} numberOfLines={1}>
          {placeMeta(place)}
        </Txt>
        {note ? (
          <Txt v="small" tone="ink2" style={{ marginTop: space.xs }} numberOfLines={2}>
            {note}
          </Txt>
        ) : null}
      </View>
      {right ??
        (score !== undefined ? (
          <View style={{ alignItems: 'flex-end', minWidth: 44 }}>
            <Score value={score} />
            {scoreCaption ? (
              <Txt v="meta" tone="ink3" style={{ fontSize: 10 }}>
                {scoreCaption}
              </Txt>
            ) : null}
          </View>
        ) : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  rank: { width: 20, paddingTop: 5 },
});
