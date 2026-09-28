import { fmtTime, riyadhMinutes } from './geo';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "SUN 28 SEP · 21:40", in Riyadh time regardless of device zone. */
export function riyadhStamp(now: Date): string {
  const local = new Date(now.getTime() + 3 * 3600 * 1000);
  return `${DAYS[local.getUTCDay()]} ${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]} · ${fmtTime(riyadhMinutes(now))}`;
}

export function partOfDay(minutes: number): string {
  if (minutes >= 5 * 60 && minutes < 11 * 60) return 'This morning';
  if (minutes >= 11 * 60 && minutes < 17 * 60) return 'This afternoon';
  return 'Tonight';
}

/** "28 Sep" from an ISO date. */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  const month = MONTHS[m - 1];
  return `${d} ${month.charAt(0)}${month.slice(1).toLowerCase()}`;
}

/** Today's ISO date in Riyadh. */
export function riyadhToday(now: Date): string {
  return new Date(now.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}
