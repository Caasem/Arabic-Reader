export const DAY_MS = 86_400_000;

/** Local-calendar-day key (`YYYY-MM-DD`, device timezone). */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local midnight of a `YYYY-MM-DD` key. (`new Date('YYYY-MM-DD')` parses as
 * UTC midnight, which is a different calendar day in most timezones.) */
export function parseDayKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight `days` calendar days after `ts`'s day. Calendar arithmetic,
 * so it stays on midnight across DST changes (unlike adding 24h). */
export function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Whole calendar days from key `from` to key `to`, independent of DST. */
export function daysBetween(from: string, to: string): number {
  const utc = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}
