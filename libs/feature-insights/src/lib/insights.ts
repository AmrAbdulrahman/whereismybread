import 'server-only';

import { unstable_cache } from 'next/cache';
import { getCurrentUser } from '@wib/auth/server';
import { getInsightsLayout, type InsightsLayoutData } from '@wib/db';
import { todayIn } from '@wib/domain';
import {
  getBankTransactionsData,
  getBoardData,
  getBudgetsData,
  getExpensesData,
} from '@wib/feature-payments/server';
import {
  annualOrOneTimeComingUp,
  annualRenewals,
  bigComingUp,
  flaggedOccurrences,
  nextMonthProjection,
  overBudget,
  unbudgetedThisMonth,
  type InsightsItem,
  type NextMonthProjection,
  type Unbudgeted,
} from './insights-compute';

export interface InsightsData {
  comingUp: {
    bigSoon: InsightsItem[];
    annualOrOneTime: InsightsItem[];
    annualRenewals: InsightsItem[];
  };
  attention: {
    reviewCount: number;
    flagged: InsightsItem[];
    overBudget: InsightsItem[];
    nextMonthProjection: NextMonthProjection | null;
    unbudgeted: Unbudgeted | null;
  };
  /** Saved card order + column spans for this user. */
  layout: InsightsLayoutData;
}

/**
 * Everything the `/insights` page shows. Aggregates the plan board (the default
 * 4-month look-ahead window), budgets, expenses and the bank-sync review inbox.
 * `board`, `budgets` and `expenses` all ride the one shared, cached page bundle
 * (`getBoardData()` with no opts = the canonical window) — so this and the
 * `<Dashboard>` on the same page cost one bundle read between them.
 */
export async function getInsightsData(): Promise<InsightsData> {
  const user = await getCurrentUser();
  if (!user) throw new Error('getInsightsData: not signed in');
  const today = todayIn(user.timezone);

  const { board } = await getBoardData();
  const budgets = await getBudgetsData();
  const expenses = await getExpensesData();
  const { pending } = await getBankTransactionsData();
  const layout = await unstable_cache(
    () => getInsightsLayout(user.id),
    ['insights-layout', user.id],
    { tags: [`user-data:${user.id}`], revalidate: 60 },
  )();

  const { displayCurrency, rates, occurrences } = board;

  return {
    layout,
    comingUp: {
      bigSoon: bigComingUp(occurrences, today, displayCurrency, rates),
      annualOrOneTime: annualOrOneTimeComingUp(
        occurrences,
        today,
        displayCurrency,
        rates,
      ),
      annualRenewals: annualRenewals(
        occurrences,
        today,
        displayCurrency,
        rates,
      ),
    },
    attention: {
      reviewCount: pending.length,
      flagged: flaggedOccurrences(occurrences, today),
      overBudget: overBudget(budgets),
      nextMonthProjection: nextMonthProjection(board),
      unbudgeted: unbudgetedThisMonth(expenses, today, displayCurrency, rates),
    },
  };
}
