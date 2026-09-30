import { distanceKm } from './geo';
import { AREAS, type Area } from './vocabulary';

/** Farther than this from every known neighbourhood, we stop naming one. */
const NEAR_KM = 6;

export function nearestArea(lat: number, lng: number): { area: Area; km: number } {
  let best = { area: AREAS[0], km: Infinity };
  for (const area of AREAS) {
    const km = distanceKm({ lat, lng }, area);
    if (km < best.km) best = { area, km };
  }
  return best;
}

/** "Near Al Malqa" when close to a known neighbourhood, otherwise just "your location". */
export function gpsLabel(lat: number, lng: number): string {
  const { area, km } = nearestArea(lat, lng);
  return km <= NEAR_KM ? `near ${area.name}` : 'your location';
}
