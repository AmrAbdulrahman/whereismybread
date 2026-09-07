import {
  addDays,
  addMonths,
  convertMoney,
  endOfMonth,
  formatConverted,
  formatMoney,
  money,
  startOfMonth,
  type Money,
  type RateMap,
} from '@wib/domain';
import type {
  BoardOccurrence,
  BudgetSummary,
  ExpenseLine,
  PaymentBoard,
} from '@wib/feature-payments';

/** "big" cutoff, in display-currency minor units. "> £30". Could become a pref. */
export const BIG_THRESHOLD_MINOR = 3000;
/** "coming up soon" window for big charges. */
export const SOON_DAYS = 10;
/** How far ahead we scan for annual / one-time items. */
export const LOOKAHEAD_MONTHS = 4;

export interface InsightsItem {
  key: string;
  name: string;
  /** "today" / "tomorrow" / "in 6 days" / "12 Oct" — null when not date-bound. */
  dateLabel: string | null;
  amountLabel: string;
  /** Where clicking the row goes. */
  href: string;
}

// --- date helpers -------------------------------------------------------

/** "today" / "tomorrow" / "in N days" (≤ SOON window) / "12 Oct". */
export function relativeDay(dueDate: string, today: string): string {
  if (dueDate <= today) return dueDate === today ? 'today' : 'overdue';
  if (dueDate === addDays(today, 1)) return 'tomorrow';
  // count calendar days between
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${dueDate}T00:00:00Z`);
  const days = Math.round((b - a) / 86_400_000);
  if (days <= 14) return `in ${days} days`;
  return new Date(`${dueDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function convertedMinor(
  amount: Money,
  displayCurrency: string,
  rates: RateMap,
): number | null {
  const c = convertMoney(amount, displayCurrency, rates);
  return c.currency === displayCurrency.toUpperCase() ? c.minorUnits : null;
}

// --- Coming up ---------------------------------------------------------

/** Deep-link that opens this occurrence's edit modal on the plan page. */
function planHref(occ: BoardOccurrence): string {
  return `/plan?open=${encodeURIComponent(occ.paymentId)}&on=${occ.dueDate}`;
}

function toItem(
  occ: BoardOccurrence,
  today: string,
  displayCurrency: string,
  rates: RateMap,
): InsightsItem {
  return {
    key: occ.key,
    name: occ.name,
    dateLabel: relativeDay(occ.dueDate, today),
    amountLabel: formatConverted(occ.amount, displayCurrency, rates),
    href: planHref(occ),
  };
}

const isLive = (o: BoardOccurrence) =>
  o.status !== 'skipped' && o.status !== 'paid';

/** Charges ≥ the "big" threshold due within the next {@link SOON_DAYS} days. */
export function bigComingUp(
  occurrences: BoardOccurrence[],
  today: string,
  displayCurrency: string,
  rates: RateMap,
): InsightsItem[] {
  const until = addDays(today, SOON_DAYS);
  return occurrences
    .filter((o) => {
      if (!isLive(o) || o.dueDate < today || o.dueDate > until) return false;
      const m = convertedMinor(o.amount, displayCurrency, rates);
      return m != null && m >= BIG_THRESHOLD_MINOR;
    })
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
    .map((o) => toItem(o, today, displayCurrency, rates));
}

function lookaheadEnd(today: string): string {
  return endOfMonth(addMonths(today, LOOKAHEAD_MONTHS));
}

/** Annual or one-time payments landing in the next {@link LOOKAHEAD_MONTHS} months. */
export function annualOrOneTimeComingUp(
  occurrences: BoardOccurrence[],
  today: string,
  displayCurrency: string,
  rates: RateMap,
): InsightsItem[] {
  const end = lookaheadEnd(today);
  return occurrences
    .filter(
      (o) =>
        isLive(o) &&
        (o.recurrence === 'annual' || o.isOneTime) &&
        o.dueDate >= today &&
        o.dueDate <= end,
    )
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
    .map((o) => toItem(o, today, displayCurrency, rates));
}

/** Annual *subscriptions* renewing in the next {@link LOOKAHEAD_MONTHS} months. */
export function annualRenewals(
  occurrences: BoardOccurrence[],
  today: string,
  displayCurrency: string,
  rates: RateMap,
): InsightsItem[] {
  const end = lookaheadEnd(today);
  return occurrences
    .filter(
      (o) =>
        isLive(o) &&
        o.recurrence === 'annual' &&
        o.isSubscription &&
        o.dueDate >= today &&
        o.dueDate <= end,
    )
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
    .map((o) => ({
      ...toItem(o, today, displayCurrency, rates),
      href: '/subscriptions',
    }));
}

// --- Needs your attention --------------------------------------------

function flagRow(o: BoardOccurrence, today: string): InsightsItem {
  const note = o.seriesFlagNote ?? o.instanceFlagNote ?? '';
  return {
    key: o.key,
    name: o.name,
    dateLabel: relativeDay(o.dueDate, today),
    amountLabel: note.length > 60 ? `${note.slice(0, 57)}…` : note,
    href: planHref(o),
  };
}

/**
 * Flagged payments, de-duplicated:
 *  - a **series** flag → one row per payment (its current-month occurrence if
 *    there is one, otherwise the soonest upcoming) — so a monthly flagged
 *    payment isn't listed four times.
 *  - an **occurrence** flag → each one (they're specific by nature).
 */
export function flaggedOccurrences(
  occurrences: BoardOccurrence[],
  today: string,
): InsightsItem[] {
  const monthKey = today.slice(0, 7);
  const live = occurrences.filter((o) => o.status !== 'skipped');

  // Series flags: pick one representative occurrence per payment.
  const bySeries = new Map<string, BoardOccurrence>();
  for (const o of live) {
    if (o.seriesFlagNote == null) continue;
    const cur = bySeries.get(o.paymentId);
    if (!cur) {
      bySeries.set(o.paymentId, o);
      continue;
    }
    const score = (x: BoardOccurrence) =>
      x.dueDate.slice(0, 7) === monthKey ? 0 : x.dueDate >= today ? 1 : 2;
    if (
      score(o) < score(cur) ||
      (score(o) === score(cur) && o.dueDate < cur.dueDate)
    ) {
      bySeries.set(o.paymentId, o);
    }
  }

  // Occurrence-only flags (payment isn't series-flagged): keep each.
  const instanceRows = live.filter(
    (o) => o.instanceFlagNote != null && o.seriesFlagNote == null,
  );

  return [...bySeries.values(), ...instanceRows]
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
    .map((o) => flagRow(o, today));
}

/** Budgets at or above 90% used — over, or about to bust. */
export function overBudget(budgets: BudgetSummary[]): InsightsItem[] {
  return budgets
    .filter(
      (b) => !b.closedAt && b.limit.minorUnits > 0 && b.progress >= 0.9,
    )
    .sort((a, b) => b.progress - a.progress)
    .map((b) => {
      const over = b.remainingMinor < 0;
      const label = over
        ? `over by ${formatMoney(money(-b.remainingMinor, b.limit.currency))}`
        : `${formatMoney(money(b.remainingMinor, b.limit.currency))} left · ${Math.round(b.progress * 100)}% used`;
      return {
        key: b.id,
        name: b.name,
        dateLabel: null,
        amountLabel: label,
        href: '/budgets',
      };
    });
}

export interface NextMonthProjection {
  label: string;
  /** Set when the projection is over income. */
  overBy: string | null;
}

/**
 * Next month's still-due payments vs its income. Returns a note only when the
 * month is projected tight (> 85%) or over.
 */
export function nextMonthProjection(
  board: PaymentBoard,
): NextMonthProjection | null {
  const nextKey = addMonths(startOfMonth(board.today), 1).slice(0, 7);
  const dueMinor = board.occurrences
    .filter((o) => o.status !== 'skipped' && o.dueDate.slice(0, 7) === nextKey)
    .reduce((sum, o) => {
      const m = convertedMinor(o.amount, board.displayCurrency, board.rates);
      return m == null ? sum : sum + m;
    }, 0);
  const incomeMinor =
    board.incomeByMonth[nextKey] ?? board.defaultIncomeMinor ?? 0;
  if (incomeMinor <= 0 || dueMinor <= 0) return null;
  const ratio = dueMinor / incomeMinor;
  if (ratio <= 0.85) return null;
  const cur = board.displayCurrency;
  const dueLabel = formatMoney(money(dueMinor, cur));
  const incomeLabel = formatMoney(money(incomeMinor, cur));
  if (ratio > 1) {
    return {
      label: `Next month's payments (${dueLabel}) exceed its income (${incomeLabel})`,
      overBy: formatMoney(money(dueMinor - incomeMinor, cur)),
    };
  }
  return {
    label: `Next month's payments (${dueLabel}) are ${Math.round(ratio * 100)}% of its income (${incomeLabel})`,
    overBy: null,
  };
}

export interface Unbudgeted {
  count: number;
  totalLabel: string;
  suggestion: string;
}

/** Unbudgeted expenses recorded this month, with a "make a budget" hint. */
export function unbudgetedThisMonth(
  expenses: ExpenseLine[],
  today: string,
  displayCurrency: string,
  rates: RateMap,
): Unbudgeted | null {
  const monthKey = today.slice(0, 7);
  const rows = expenses.filter(
    (e) => e.budgetId == null && e.date.slice(0, 7) === monthKey,
  );
  if (rows.length === 0) return null;

  let totalMinor = 0;
  const byAccount = new Map<string, number>();
  for (const e of rows) {
    const m = convertedMinor(e.amount, displayCurrency, rates);
    if (m == null) continue;
    totalMinor += m;
    const label = e.accountName ?? 'no account';
    byAccount.set(label, (byAccount.get(label) ?? 0) + m);
  }
  const top = [...byAccount.entries()].sort((a, b) => b[1] - a[1])[0];
  const suggestion =
    top && top[0] !== 'no account'
      ? `Most of it is on “${top[0]}” — a budget for it would keep next month in check.`
      : 'A budget would help you keep an eye on this kind of spend.';

  return {
    count: rows.length,
    totalLabel: formatMoney(money(totalMinor, displayCurrency)),
    suggestion,
  };
}
