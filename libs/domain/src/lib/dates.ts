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

export function daysInMonth(date: IsoDate): number {
  const d = parseIsoDate(date);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
}

export function endOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-${String(daysInMonth(date)).padStart(2, '0')}`;
}

/**
 * The start date for a recurring payment that lands on `dayOfMonth` (1–31),
 * clamped to the month's length. With no `existing` anchor it picks the
 * soonest upcoming month (this month if the day hasn't passed, else next);
 * with one, it keeps that anchor's month and only swaps the day.
 */
export function anchorForDayOfMonth(
  dayOfMonth: number,
  today: IsoDate,
  existing?: IsoDate | null,
): IsoDate {
  const clamp = (ym: string) =>
    Math.min(dayOfMonth, daysInMonth(`${ym}-01` as IsoDate));

  if (existing) {
    const ym = existing.slice(0, 7);
    return `${ym}-${String(clamp(ym)).padStart(2, '0')}` as IsoDate;
  }
  const todayDay = Number(today.slice(8, 10));
  const base = dayOfMonth >= todayDay ? today : addMonths(today, 1);
  const ym = base.slice(0, 7);
  return `${ym}-${String(clamp(ym)).padStart(2, '0')}` as IsoDate;
}

/** Whole months from `from` to `to` (negative if `to` is earlier). */
export function monthsBetween(from: IsoDate, to: IsoDate): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth())
  );
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayMonday0(date: IsoDate): number {
  return (parseIsoDate(date).getUTCDay() + 6) % 7;
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = parseIsoDate(to).getTime() - parseIsoDate(from).getTime();
  return Math.round(ms / 86_400_000);
}
