import { addMonths, endOfMonth, startOfMonth, type IsoDate } from '@wib/domain';
import { and, asc, desc, eq } from 'drizzle-orm';
import { getDb, getSql } from '../client';
import { budgets, type Budget } from '../schema/budgets';
import type { Expense, ExpenseAttachment } from '../schema/budgets';

export type BudgetExpenseAttachment = Pick<
  ExpenseAttachment,
  'id' | 'name' | 'contentType' | 'size' | 'url' | 'pathname'
>;

export type BudgetExpense = Expense & {
  attachments: BudgetExpenseAttachment[];
};

/** A budget with all of its expenses (and their attachments) folded in. */
export type BudgetWithExpenses = Budget & { expenses: BudgetExpense[] };

const camelCache: Record<string, string> = {};
const toCamel = (s: string): string =>
  (camelCache[s] ??= s.replace(/_([a-z0-9])/g, (_, c: string) =>
    c.toUpperCase(),
  ));

function camelRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) out[toCamel(key)] = row[key];
  return out as T;
}

export interface BudgetInput {
  name: string;
  period: 'month' | 'week';
  startDate: string;
  endDate: string;
  amountMinor: number;
  currency: string;
  color?: string;
  /** Month budgets only — an ongoing monthly series. */
  recurring?: boolean;
}

export async function listBudgets(userId: string): Promise<Budget[]> {
  return getDb()
    .select()
    .from(budgets)
    .where(eq(budgets.userId, userId))
    .orderBy(asc(budgets.startDate));
}

/**
 * Every budget the user owns, each with its expenses (and their attachments)
 * — one round trip, in the shape the /budgets page and the plan header need.
 */
export async function getBudgetsBundle(
  userId: string,
): Promise<BudgetWithExpenses[]> {
  const sql = getSql();
  const rows = await sql<Array<{ budgets: unknown }>>`
    select coalesce((
      select jsonb_agg(
        to_jsonb(b) || jsonb_build_object(
          'expenses', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', e.id, 'userId', e.user_id, 'budgetId', e.budget_id,
                'name', e.name, 'date', e.date, 'amountMinor', e.amount_minor,
                'currency', e.currency, 'notes', e.notes,
                'createdAt', e.created_at, 'updatedAt', e.updated_at,
                'attachments', coalesce((
                  select jsonb_agg(jsonb_build_object(
                    'id', a.id, 'name', a.name,
                    'contentType', a.content_type, 'size', a.size,
                    'url', a.url, 'pathname', a.pathname)
                    order by a.created_at, a.id)
                  from expense_attachments a
                  where a.expense_id = e.id
                ), '[]'::jsonb)
              )
              order by e.date, e.created_at
            )
            from expenses e
            where e.budget_id = b.id
          ), '[]'::jsonb)
        )
        order by b.start_date desc, b.created_at desc
      )
      from budgets b
      where b.user_id = ${userId}
    ), '[]'::jsonb) as budgets
  `;

  const raw = (rows[0]?.budgets ?? []) as Array<Record<string, unknown>>;
  return raw.map((row) => camelRow<BudgetWithExpenses>(row));
}

export async function createBudget(
  userId: string,
  input: BudgetInput,
): Promise<Budget> {
  const rows = await getDb()
    .insert(budgets)
    .values({
      userId,
      name: input.name.trim(),
      period: input.period,
      startDate: input.startDate,
      endDate: input.endDate,
      amountMinor: input.amountMinor,
      currency: input.currency,
      color: input.color ?? '#6321d6',
      recurring: input.period === 'month' ? (input.recurring ?? false) : false,
    })
    .returning();
  if (!rows[0]) throw new Error('createBudget: no row');
  return rows[0];
}

export async function updateBudget(
  userId: string,
  id: string,
  input: BudgetInput,
): Promise<Budget | null> {
  const rows = await getDb()
    .update(budgets)
    .set({
      name: input.name.trim(),
      period: input.period,
      startDate: input.startDate,
      endDate: input.endDate,
      amountMinor: input.amountMinor,
      currency: input.currency,
      ...(input.color ? { color: input.color } : {}),
      recurring: input.period === 'month' ? (input.recurring ?? false) : false,
      updatedAt: new Date(),
    })
    .where(and(eq(budgets.id, id), eq(budgets.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteBudget(userId: string, id: string): Promise<void> {
  await getDb()
    .delete(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.userId, userId)));
}

/**
 * Make sure every recurring monthly budget has an instance covering
 * `through` — walking forward month by month from whichever row is
 * currently the latest for that name, cloning its name/amount/currency/
 * colour into each new month. A no-op once everything's caught up.
 */
export async function materializeRecurringBudgets(
  userId: string,
  through: string,
): Promise<void> {
  const rows = await getDb()
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.userId, userId),
        eq(budgets.recurring, true),
        eq(budgets.period, 'month'),
      ),
    )
    .orderBy(desc(budgets.startDate));

  const latestByName = new Map<string, Budget>();
  for (const row of rows) {
    if (!latestByName.has(row.name)) latestByName.set(row.name, row);
  }

  for (const latest of latestByName.values()) {
    let cursor = latest;
    while (cursor.endDate < through) {
      const nextStart = startOfMonth(addMonths(cursor.startDate as IsoDate, 1));
      const nextEnd = endOfMonth(nextStart);
      const inserted = await getDb()
        .insert(budgets)
        .values({
          userId,
          name: cursor.name,
          period: 'month',
          startDate: nextStart,
          endDate: nextEnd,
          amountMinor: cursor.amountMinor,
          currency: cursor.currency,
          color: cursor.color,
          recurring: true,
        })
        .returning();
      const next = inserted[0];
      if (!next) break;
      cursor = next;
    }
  }
}
