import { fmtTime, riyadhMinutes } from './geo';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "SUN 28 SEP · 21:40", in Riyadh time regardless of device zone. */
export function riyadhStamp(now: Date): string {
  const local = new Date(now.getTime() + 3 * 3600 * 1000);
  return `${DAYS[local.getUTCDay()]} ${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]} · ${fmtTime(riyadhMinutes(now))}`;
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

export type YearMonth = { year: number; month: number }; // month 1–12

export function parseISO(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
}

export function toISO(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addMonths({ year, month }: YearMonth, n: number): YearMonth {
  const idx = year * 12 + (month - 1) + n;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/**
 * Calendar cells for a month, weeks starting Sunday (the Saudi work week starts Sunday).
 * Leading blanks are null.
 */
export function monthGrid({ year, month }: YearMonth): (number | null)[] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [...Array<null>(firstWeekday).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthName({ year, month }: YearMonth): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** "Wed 30 Sep 2026" */
export function longDate(iso: string): string {
  const { year, month, day } = parseISO(iso);
  const wd = DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const m = MONTHS[month - 1];
  return `${wd.charAt(0)}${wd.slice(1).toLowerCase()} ${day} ${m.charAt(0)}${m.slice(1).toLowerCase()} ${year}`;
}
