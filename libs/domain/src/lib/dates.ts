/**
 * Due dates are calendar dates with no time component. We represent them as
 * `YYYY-MM-DD` strings and do arithmetic in UTC to stay DST-proof; the
 * per-user timezone only matters when deciding what "today" is.
 */
export type IsoDate = string; // YYYY-MM-DD

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): value is IsoDate {
  return (
    ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

export function parseIsoDate(value: IsoDate): Date {
  if (!isIsoDate(value)) {
    throw new Error(`"${value}" is not an ISO date (YYYY-MM-DD)`);
  }
  return new Date(`${value}T00:00:00Z`);
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** Today, in the given IANA timezone (defaults to the runtime's zone). */
export function todayIn(timeZone?: string): IsoDate {
  const now = new Date();
  if (!timeZone) return toIsoDate(now);
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = parseIsoDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = parseIsoDate(date);
  const targetMonth = d.getUTCMonth() + months;
  const anchorDay = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(targetMonth);
  // clamp (e.g. Jan 31 + 1 month -> Feb 28/29)
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(anchorDay, lastDay));
  return toIsoDate(d);
}

export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = parseIsoDate(to).getTime() - parseIsoDate(from).getTime();
  return Math.round(ms / 86_400_000);
}
