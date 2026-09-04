import { requireUserId } from '@wib/auth/server';
import { getBudgetsBundle, getRates } from '@wib/db';
import { convertMoney, money } from '@wib/domain';
import type { BudgetExpenseView, BudgetSummary } from './types';

/** Every budget the signed-in user owns, with its spend computed. */
export async function getBudgetsData(): Promise<BudgetSummary[]> {
  const userId = await requireUserId();
  // Sequential — the Supabase transaction pooler punishes concurrent reads.
  const bundle = await getBudgetsBundle(userId);
  const rates = await getRates();

  return bundle.map((b) => {
    const settleCurrency = b.currency.toUpperCase();
    const expenses: BudgetExpenseView[] = b.expenses.map((e) => ({
      id: e.id,
      name: e.name,
      date: e.date,
      amount: money(e.amountMinor, e.currency),
      notes: e.notes,
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
      limit: money(b.amountMinor, settleCurrency),
      spentMinor,
      remainingMinor: b.amountMinor - spentMinor,
      progress: b.amountMinor > 0 ? spentMinor / b.amountMinor : 0,
      expenses,
    };
  });
}

/** The budgets whose period overlaps a given `YYYY-MM-DD`…`YYYY-MM-DD` range. */
export function budgetsOverlapping(
  budgets: BudgetSummary[],
  from: string,
  to: string,
): BudgetSummary[] {
  return budgets.filter((b) => b.startDate <= to && b.endDate >= from);
}
