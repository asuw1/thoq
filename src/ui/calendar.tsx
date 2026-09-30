import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { addMonths, monthGrid, monthName, parseISO, toISO, type YearMonth } from '../domain/clock';
import { radius, space } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { Txt } from './primitives';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Month grid. Opens on the selected date's month; dates after `max` can't be picked. */
export function Calendar({ value, max, onChange }: { value: string; max: string; onChange: (iso: string) => void }) {
  const c = usePalette();
  const sel = parseISO(value);
  const lim = parseISO(max);
  const [view, setView] = useState<YearMonth>({ year: sel.year, month: sel.month });
  const atMax = view.year === lim.year && view.month === lim.month;
  const cells = monthGrid(view);

  return (
    <View>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={12} onPress={() => setView(addMonths(view, -1))}>
          <Txt v="bodyStrong">←</Txt>
        </Pressable>
        <Txt v="bodyStrong">{monthName(view)}</Txt>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" hitSlop={12} disabled={atMax} onPress={() => setView(addMonths(view, 1))}>
          <Txt v="bodyStrong" tone={atMax ? 'ink3' : 'ink'}>
            →
          </Txt>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((d, i) => (
          <View key={`w${i}`} style={styles.cell}>
            <Txt v="meta" tone="ink3">
              {d}
            </Txt>
          </View>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <View key={`b${i}`} style={styles.cell} />;
          const iso = toISO(view.year, view.month, day);
          const selected = iso === value;
          const future = iso > max;
          const today = iso === max;
          return (
            <Pressable
              key={iso}
              disabled={future}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: future }}
              accessibilityLabel={iso}
              onPress={() => onChange(iso)}
              style={styles.cell}>
              <View style={[styles.day, selected && { backgroundColor: c.ink }, !selected && today && { borderWidth: 1, borderColor: c.ink }]}>
                <Txt v="numeral" tone={selected ? 'onInk' : future ? 'ink3' : 'ink'} style={{ fontSize: 14, opacity: future ? 0.5 : 1 }}>
                  {day}
                </Txt>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  day: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius },
});
