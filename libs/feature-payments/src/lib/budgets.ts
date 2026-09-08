import { cache } from 'react';
import { requireUser } from '@wib/auth/server';
import {
  getBudgetsBundle,
  getRates,
  materializeRecurringBudgets,
  type BudgetWithExpenses,
} from '@wib/db';
import {
  addMonths,
  convertMoney,
  endOfMonth,
  money,
  todayIn,
} from '@wib/domain';
import { canonicalWindow, loadBundle } from './queries';
import type { BudgetExpenseView, BudgetSummary } from './types';

/** Every budget the signed-in user owns, with its spend computed. */
export const getBudgetsData = cache(async (): Promise<BudgetSummary[]> => {
  const user = await requireUser();
  const today = todayIn(user.timezone);
  const { from, to } = canonicalWindow(today);
  // Budgets + expenses ride on the shared page bundle — no extra round trip
  // on the `/plan` and `/insights` paths (both use the canonical window).
  const bundleData = await loadBundle(user.id, from, to);

  // Catch a recurring budget up through the same forward window the plan
  // board defaults to, so browsing a few months ahead finds one already
  // materialized instead of a gap. Steady state (latest instance already
  // covers the window) does zero work; only a month rollover pays for the
  // materialize + one fresh budgets read.
  const through = endOfMonth(addMonths(today, 3));
  let budgets: BudgetWithExpenses[] = bundleData.budgets;
  // Latest instance per recurring series (mirrors `materializeRecurringBudgets`'
  // own name-grouping) — catch up only if a series' newest month is behind.
  const latestByName = new Map<string, string>();
  for (const b of budgets) {
    if (!b.recurring || b.period !== 'month') continue;
    const cur = latestByName.get(b.name);
    if (cur == null || b.endDate > cur) latestByName.set(b.name, b.endDate);
  }
  const behind = [...latestByName.values()].some((end) => end < through);
  if (behind) {
    await materializeRecurringBudgets(user.id, through);
    budgets = await getBudgetsBundle(user.id);
  }
  const rates = await getRates();

  return budgets.map((b) => {
    const settleCurrency = b.currency.toUpperCase();
    const expenses: BudgetExpenseView[] = b.expenses.map((e) => ({
      id: e.id,
      name: e.name,
      date: e.date,
      occurredAt: e.occurredAt ? String(e.occurredAt) : null,
      amount: money(e.amountMinor, e.currency),
      notes: e.notes,
      url: e.url,
      logoUrl: e.logoUrl,
      brandColor: e.brandColor,
      accountId: e.accountId,
      accountName: e.accountName,
      accountColor: e.accountColor,
      bankId: e.bankId,
      bankName: e.bankName,
      bankColor: e.bankColor,
      bankIconKey: e.bankIconKey,
      bankLogoUrl: e.bankLogoUrl,
      tags: e.tags,
      attachments: e.attachments,
    }));
    const spentMinor = expenses.reduce((sum, e) => {
      const converted = convertMoney(e.amount, settleCurrency, rates);
      return converted.currency === settleCurrency
        ? sum + converted.minorUnits
        : sum;
    }, 0);

    return {
      id: b.id,
      name: b.name,
      period: b.period,
      startDate: b.startDate,
      endDate: b.endDate,
      color: b.color,
      recurring: b.recurring,
      closedAt: b.closedAt ? String(b.closedAt) : null,
      limit: money(b.amountMinor, settleCurrency),
      spentMinor,
      remainingMinor: b.amountMinor - spentMinor,
      progress: b.amountMinor > 0 ? spentMinor / b.amountMinor : 0,
      expenses,
    };
  });
});

/** The budgets whose period overlaps a given `YYYY-MM-DD`…`YYYY-MM-DD` range. */
export function budgetsOverlapping(
  budgets: BudgetSummary[],
  from: string,
  to: string,
): BudgetSummary[] {
  return budgets.filter((b) => b.startDate <= to && b.endDate >= from);
}
