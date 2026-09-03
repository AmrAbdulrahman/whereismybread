import {
  addMonths,
  convertMoney,
  endOfMonth,
  startOfMonth,
  todayIn,
  type IsoDate,
} from '@wib/domain';
import { requireUser } from '@wib/auth/server';
import { getBoardData } from './queries';
import { isManualPayment } from './due-alert';
import type { BoardOccurrence, ChecklistData, ChecklistMonth } from './types';

export type { ChecklistData, ChecklistMonth };

/**
 * Which month the checklist treats as "now": the current month runs from the
 * **20th of the previous month** to the **19th of this month**, so once you're
 * on/after the 20th the next month becomes current.
 */
export function checklistMonthKey(today: IsoDate): string {
  const base = startOfMonth(today);
  const day = Number(today.slice(8, 10));
  return (day >= 20 ? startOfMonth(addMonths(base, 1)) : base).slice(0, 7);
}

const monthLabel = (key: string) =>
  new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${key}-01T00:00:00Z`));

/** The monthly manual-payment checklist — 6 months back, a year ahead. */
export async function getChecklistData(): Promise<ChecklistData> {
  const user = await requireUser();
  const today = todayIn(user.timezone);
  const currentMonthKey = checklistMonthKey(today);

  const from = startOfMonth(addMonths(today, -6));
  const to = endOfMonth(addMonths(today, 12));
  const { board } = await getBoardData({ from, to });

  const display = board.displayCurrency;
  const rates = board.rates;

  const manual = board.occurrences.filter(isManualPayment);

  const byMonth = new Map<string, BoardOccurrence[]>();
  for (const occ of manual) {
    const key = occ.dueDate.slice(0, 7);
    const list = byMonth.get(key);
    if (list) list.push(occ);
    else byMonth.set(key, [occ]);
  }
  // Always show the current month, even if there's nothing in it.
  if (!byMonth.has(currentMonthKey)) byMonth.set(currentMonthKey, []);

  const rank = (o: BoardOccurrence) =>
    o.status === 'skipped' ? 2 : o.status === 'paid' ? 1 : 0;

  const months: ChecklistMonth[] = [...byMonth.keys()]
    .sort()
    .map((key) => {
      const occurrences = [...(byMonth.get(key) ?? [])].sort(
        (a, b) => rank(a) - rank(b) || (a.dueDate < b.dueDate ? -1 : 1),
      );
      const active = occurrences.filter((o) => o.status !== 'skipped');
      const remainingMinor = active
        .filter((o) => o.status === 'scheduled')
        .reduce((sum, o) => {
          const c = convertMoney(o.amount, display, rates);
          return c.currency === display.toUpperCase()
            ? sum + c.minorUnits
            : sum;
        }, 0);
      return {
        key,
        label: monthLabel(key),
        occurrences,
        doneCount: active.filter((o) => o.status === 'paid').length,
        totalCount: active.length,
        remainingMinor,
        isPast: key < currentMonthKey,
        isCurrent: key === currentMonthKey,
      };
    });

  const empty = manual.length === 0;
  return { months, currentMonthKey, today, displayCurrency: display, rates, empty };
}
