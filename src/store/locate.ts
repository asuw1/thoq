import * as Location from 'expo-location';

import { gpsLabel } from '../domain/origin';
import type { Origin } from './state';

export type LocateResult = { ok: true; origin: Origin } | { ok: false; reason: 'denied' | 'unavailable' };

/** Ask for foreground location once and turn it into an Origin. Never throws. */
export async function locate(): Promise<LocateResult> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: 'denied' };
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    const { latitude: lat, longitude: lng } = pos.coords;
    return { ok: true, origin: { lat, lng, label: gpsLabel(lat, lng), source: 'gps' } };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
