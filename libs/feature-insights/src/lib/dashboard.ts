import 'server-only';

import { getCurrentUser } from '@wib/auth/server';
import {
  getRates,
  listDashboardCharts,
  seedDashboardCharts,
  type DashboardChart,
} from '@wib/db';
import { convertMoney, todayIn, type Money, type RateMap } from '@wib/domain';
import {
  getAccounts,
  getBoardData,
  getExpensesData,
  getTags,
} from '@wib/feature-payments/server';
import type { BoardOccurrence, ExpenseLine } from '@wib/feature-payments';
import {
  buildSeries,
  statStrip,
  type ChartSeries,
  type SpendItem,
  type SpendSource,
  type StatStripData,
} from './dashboard-compute';

export interface DashboardOption {
  id: string;
  name: string;
  color: string;
}

export interface DashboardData {
  /** The month in view, `YYYY-MM`. */
  month: string;
  prevMonth: string;
  nextMonth: string;
  currency: string;
  /** Which spend sources feed the charts + headline total. */
  sources: SpendSource[];
  stat: StatStripData;
  charts: ChartSeries[];
  accounts: DashboardOption[];
  tags: DashboardOption[];
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ALL_SOURCES: SpendSource[] = ['planned', 'expense'];

function shiftMonth(month: string, by: number): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const d = new Date(Date.UTC(year, monthIndex + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Parse `?src=planned,expense` — defaults to both, never empty. */
function parseSources(raw?: string): SpendSource[] {
  if (!raw) return ALL_SOURCES;
  const wanted = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is SpendSource => s === 'planned' || s === 'expense');
  return wanted.length > 0 ? [...new Set(wanted)] : ALL_SOURCES;
}

function minorIn(amount: Money, currency: string, rates: RateMap): number {
  const c = convertMoney(amount, currency, rates);
  return c.currency === currency.toUpperCase() ? c.minorUnits : 0;
}

function expenseItems(
  expenses: ExpenseLine[],
  currency: string,
  rates: RateMap,
): SpendItem[] {
  return expenses.map((e) => ({
    date: e.date,
    minor: minorIn(e.amount, currency, rates),
    accountId: e.accountId,
    accountName: e.accountName,
    accountColor: e.accountColor,
    tags: e.tags,
    source: 'expense' as const,
    budgeted: e.budgetId != null,
  }));
}

function plannedItems(
  occurrences: BoardOccurrence[],
  currency: string,
  rates: RateMap,
): SpendItem[] {
  return occurrences
    .filter((o) => o.status !== 'skipped')
    .map((o) => ({
      date: o.dueDate,
      minor: minorIn(o.amount, currency, rates),
      accountId: o.account?.id ?? null,
      accountName: o.account?.name ?? null,
      accountColor: o.account?.color ?? null,
      tags: o.tags,
      source: 'planned' as const,
      budgeted: false,
    }));
}

const DEFAULT_CHARTS = [
  { kind: 'month_spend_line' as const, title: 'Spending this month', config: {} },
  { kind: 'account_pie' as const, title: 'By account', config: {} },
  { kind: 'tag_pie' as const, title: 'By tag', config: {} },
];

/**
 * The Stats dashboard for `/insights`. One shared month (`?m=`) and one shared
 * planned/expenses source filter (`?src=`) drive the stat strip and every
 * chart; per-chart `config` only holds the account/tag filters and card span.
 * Reads are sequential (Supabase pooler).
 */
export async function getDashboardData(
  monthParam?: string,
  sourcesParam?: string,
): Promise<DashboardData> {
  const user = await getCurrentUser();
  if (!user) throw new Error('getDashboardData: not signed in');

  const today = todayIn(user.timezone);
  const month =
    monthParam && MONTH_RE.test(monthParam) ? monthParam : today.slice(0, 7);
  const sources = parseSources(sourcesParam);
  const currency = user.displayCurrency;

  let rows: DashboardChart[] = await listDashboardCharts(user.id);
  if (rows.length === 0) {
    rows = await seedDashboardCharts(user.id, DEFAULT_CHARTS);
  }

  const rates = await getRates();
  const expenses = await getExpensesData();
  const { board } = await getBoardData({ month: `${month}-01` });
  const accounts = await getAccounts();
  const tags = await getTags();

  const allItems: SpendItem[] = [
    ...expenseItems(expenses, currency, rates),
    ...plannedItems(board.occurrences, currency, rates),
  ];
  const active = new Set(sources);
  const selected = allItems.filter((it) => active.has(it.source));

  const stat = statStrip(allItems, month, currency, active);
  const charts = rows.map((c) =>
    buildSeries(
      { id: c.id, kind: c.kind, title: c.title, config: c.config },
      selected,
      month,
      currency,
    ),
  );

  return {
    month,
    prevMonth: shiftMonth(month, -1),
    nextMonth: shiftMonth(month, 1),
    currency: currency.toUpperCase(),
    sources,
    stat,
    charts,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, color: a.color })),
    tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
  };
}
