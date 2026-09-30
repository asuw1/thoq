import { describe, expect, it } from 'vitest';

import { addMonths, longDate, monthGrid, riyadhToday, toISO } from './clock';

describe('calendar helpers', () => {
  it('lays out September 2026 starting on Tuesday (Sunday-first weeks)', () => {
    const cells = monthGrid({ year: 2026, month: 9 });
    expect(cells.slice(0, 3)).toEqual([null, null, 1]);
    expect(cells.filter(Boolean)).toHaveLength(30);
  });

  it('handles leap years', () => {
    expect(monthGrid({ year: 2028, month: 2 }).filter(Boolean)).toHaveLength(29);
  });

  it('moves across year boundaries', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('formats dates', () => {
    expect(toISO(2026, 9, 3)).toBe('2026-09-03');
    expect(longDate('2026-09-30')).toBe('Wed 30 Sep 2026');
  });

  it('uses the Riyadh date, not UTC', () => {
    expect(riyadhToday(new Date('2026-09-29T22:30:00Z'))).toBe('2026-09-30');
  });
});
