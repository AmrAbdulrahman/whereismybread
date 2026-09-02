import {
  addMonths,
  daysInMonth,
  monthsBetween,
  startOfMonth,
  type IsoDate,
} from './dates';
import { monthsBetweenOccurrences, type Recurrence } from './recurrence';

/**
 * The recurrence engine. Given a payment's schedule, produce the concrete due
 * dates that fall inside a window. Pure and timezone-free — all arithmetic is
 * on `YYYY-MM-DD` strings.
 */
export interface RecurrenceSpec {
  recurrence: Recurrence;
  /** First due date. For `one_time`, the only date. */
  anchorDate: IsoDate;
  /** 1–31. When set, each occurrence lands on this day (clamped to month length). */
  dayOfMonth?: number | null;
  /** Inclusive last date the series may produce. */
  endsOn?: IsoDate | null;
}

export interface Occurrence {
  dueDate: IsoDate;
  /** 0-based position in the series. */
  sequence: number;
}

function occurrenceDate(
  anchor: IsoDate,
  sequence: number,
  stepMonths: number,
  dayOfMonth?: number | null,
): IsoDate {
  const shifted = addMonths(anchor, sequence * stepMonths);
  if (dayOfMonth == null) return shifted;
  const day = Math.min(dayOfMonth, daysInMonth(shifted));
  return `${shifted.slice(0, 7)}-${String(day).padStart(2, '0')}`;
}

export function expandOccurrences(
  spec: RecurrenceSpec,
  window: { from: IsoDate; to: IsoDate },
  { limit = 750 }: { limit?: number } = {},
): Occurrence[] {
  if (window.to < window.from) return [];

  if (spec.recurrence === 'one_time') {
    const due = spec.anchorDate;
    return due >= window.from && due <= window.to
      ? [{ dueDate: due, sequence: 0 }]
      : [];
  }

  const stepMonths = monthsBetweenOccurrences(spec.recurrence);
  const hardEnd =
    spec.endsOn && spec.endsOn < window.to ? spec.endsOn : window.to;

  // When a day-of-month is fixed, the anchor just picks the starting month;
  // otherwise the series can't begin before the exact anchor date.
  const firstAllowed =
    spec.dayOfMonth == null ? spec.anchorDate : startOfMonth(spec.anchorDate);

  // Jump close to the window instead of iterating from the anchor.
  const monthsIn = monthsBetween(
    startOfMonth(spec.anchorDate),
    startOfMonth(window.from),
  );
  let sequence = Math.max(0, Math.floor(monthsIn / stepMonths) - 1);

  const out: Occurrence[] = [];
  for (let guard = 0; guard < limit + 24; guard++) {
    const due = occurrenceDate(
      spec.anchorDate,
      sequence,
      stepMonths,
      spec.dayOfMonth,
    );
    if (due > hardEnd) break;
    if (due >= window.from && due >= firstAllowed) {
      out.push({ dueDate: due, sequence });
      if (out.length >= limit) break;
    }
    sequence += 1;
  }
  return out;
}

/** The next due date on/after `from`, or null if the series has ended. */
export function nextOccurrence(
  spec: RecurrenceSpec,
  from: IsoDate,
): IsoDate | null {
  const horizon = spec.endsOn ?? addMonths(from, 24 * 12);
  const [first] = expandOccurrences(spec, { from, to: horizon }, { limit: 1 });
  return first?.dueDate ?? null;
}
