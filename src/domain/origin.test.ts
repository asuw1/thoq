import { describe, expect, it } from 'vitest';

import { gpsLabel, nearestArea } from './origin';

describe('origin labels', () => {
  it('names the nearest neighbourhood when close', () => {
    expect(nearestArea(24.813, 46.614).area.name).toBe('Al Malqa');
    expect(gpsLabel(24.813, 46.614)).toBe('near Al Malqa');
  });

  it('falls back to "your location" far from Riyadh', () => {
    expect(gpsLabel(21.4858, 39.1925)).toBe('your location'); // Jeddah
  });
});
