import { describe, expect, it } from 'vitest';

import { distanceKm, fmtKm, hoursStatus, isOpenAt, riyadhMinutes } from './geo';

const hm = (h: number, m = 0) => h * 60 + m;

describe('isOpenAt', () => {
  it('handles same-day hours', () => {
    const h = { open: hm(7), close: hm(23) };
    expect(isOpenAt(h, hm(6, 59))).toBe(false);
    expect(isOpenAt(h, hm(7))).toBe(true);
    expect(isOpenAt(h, hm(23))).toBe(false);
  });

  it('handles hours past midnight', () => {
    const h = { open: hm(16), close: hm(2) };
    expect(isOpenAt(h, hm(15, 59))).toBe(false);
    expect(isOpenAt(h, hm(23, 30))).toBe(true);
    expect(isOpenAt(h, hm(1, 30))).toBe(true);
    expect(isOpenAt(h, hm(2))).toBe(false);
  });

  it('treats open === close as 24h', () => {
    expect(isOpenAt({ open: 0, close: 0 }, hm(4))).toBe(true);
  });
});

describe('riyadhMinutes', () => {
  it('is UTC+3 and wraps past midnight', () => {
    expect(riyadhMinutes(new Date('2026-09-28T12:00:00Z'))).toBe(hm(15));
    expect(riyadhMinutes(new Date('2026-09-28T22:30:00Z'))).toBe(hm(1, 30));
  });
});

describe('formatting', () => {
  it('describes open status', () => {
    expect(hoursStatus({ open: hm(16), close: hm(2) }, hm(20))).toBe('Open until 02:00');
    expect(hoursStatus({ open: hm(16), close: hm(2) }, hm(10))).toBe('Opens 16:00');
  });

  it('formats distance without rounding to zero or 1000 m', () => {
    expect(fmtKm(0.01)).toBe('50 m');
    expect(fmtKm(0.42)).toBe('400 m');
    expect(fmtKm(0.99)).toBe('1.0 km');
    expect(fmtKm(3.26)).toBe('3.3 km');
  });

  it('computes plausible distances across Riyadh', () => {
    const olaya = { lat: 24.6937, lng: 46.6853 };
    const malqa = { lat: 24.812, lng: 46.613 };
    const d = distanceKm(olaya, malqa);
    expect(d).toBeGreaterThan(14);
    expect(d).toBeLessThan(16);
  });
});
