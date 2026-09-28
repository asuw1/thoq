import type { Hours } from './types';

const EARTH_KM = 6371;

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** Riyadh is UTC+3 all year (no DST), so local time is a fixed offset from UTC. */
const RIYADH_OFFSET_MIN = 180;

export function riyadhMinutes(now: Date): number {
  const utc = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (utc + RIYADH_OFFSET_MIN) % 1440;
}

export function isOpenAt(hours: Hours, minutes: number): boolean {
  const { open, close } = hours;
  if (open === close) return true; // 24h
  if (open < close) return minutes >= open && minutes < close;
  // Runs past midnight, e.g. 16:00–02:00.
  return minutes >= open || minutes < close;
}

export function fmtTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "Open until 01:00" / "Opens 18:00". */
export function hoursStatus(hours: Hours, minutes: number): string {
  return isOpenAt(hours, minutes) ? `Open until ${fmtTime(hours.close)}` : `Opens ${fmtTime(hours.open)}`;
}

export function fmtKm(km: number): string {
  const metres = Math.max(50, Math.round((km * 1000) / 50) * 50);
  return metres < 1000 ? `${metres} m` : `${km.toFixed(1)} km`;
}
