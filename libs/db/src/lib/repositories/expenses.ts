import { and, eq } from 'drizzle-orm';
import { getDb, getSql } from '../client';
import { budgets, expenses, type Expense } from '../schema/budgets';

export interface ExpenseInput {
  /** `null` — the expense isn't tracked against any budget. */
  budgetId: string | null;
  name: string;
  /** `YYYY-MM-DD`. */
  date: string;
  amountMinor: number;
  currency: string;
  notes: string | null;
}

/** `true` when `budgetId` is unset, or is a budget this user owns. */
async function ownsBudgetOrNone(
  userId: string,
  budgetId: string | null,
): Promise<boolean> {
  if (!budgetId) return true;
  const owned = await getDb()
    .select({ id: budgets.id })
    .from(budgets)
    .where(and(eq(budgets.id, budgetId), eq(budgets.userId, userId)))
    .limit(1);
  return owned.length > 0;
}

/** Insert an expense — returns `null` if a given budget isn't the user's. */
export async function createExpense(
  userId: string,
  input: ExpenseInput,
): Promise<Expense | null> {
  if (!(await ownsBudgetOrNone(userId, input.budgetId))) return null;

  const rows = await getDb()
    .insert(expenses)
    .values({
      userId,
      budgetId: input.budgetId,
      name: input.name.trim(),
      date: input.date,
      amountMinor: input.amountMinor,
      currency: input.currency,
      notes: input.notes,
    })
    .returning();
  return rows[0] ?? null;
}

/**
 * Update an expense, optionally reassigning it to a different (owned) budget
 * or clearing it to none.
 */
export async function updateExpense(
  userId: string,
  id: string,
  input: ExpenseInput,
): Promise<Expense | null> {
  if (!(await ownsBudgetOrNone(userId, input.budgetId))) return null;

  const rows = await getDb()
    .update(expenses)
    .set({
      budgetId: input.budgetId,
      name: input.name.trim(),
      date: input.date,
      amountMinor: input.amountMinor,
      currency: input.currency,
      notes: input.notes,
      updatedAt: new Date(),
    })
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function getExpense(
  userId: string,
  id: string,
): Promise<Expense | null> {
  const rows = await getDb()
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteExpense(userId: string, id: string): Promise<void> {
  await getDb()
    .delete(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)));
}

export interface ExpenseLineAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  url: string;
  pathname: string;
}

/** An expense resolved for the plan board — its budget's name/colour inlined. */
export interface ExpenseLine {
  id: string;
  name: string;
  /** `YYYY-MM-DD`. */
  date: string;
  amountMinor: number;
  currency: string;
  notes: string | null;
  budgetId: string | null;
  budgetName: string | null;
  budgetColor: string | null;
  attachments: ExpenseLineAttachment[];
}

/**
 * Every expense the user has (budgeted or not) — one round trip, its
 * budget's name/colour joined straight in. Expenses are discrete rows (not
 * generated recurrence occurrences like payments), so unlike the plan
 * board there's no window to page through — this stays a bounded,
 * cheap fetch for the whole account.
 */
export async function listExpenses(userId: string): Promise<ExpenseLine[]> {
  const sql = getSql();
  const rows = await sql<Array<{ expenses: unknown }>>`
    select coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id, 'name', e.name, 'date', e.date,
          'amountMinor', e.amount_minor, 'currency', e.currency,
          'notes', e.notes,
          'budgetId', e.budget_id, 'budgetName', b.name, 'budgetColor', b.color,
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
      left join budgets b on b.id = e.budget_id
      where e.user_id = ${userId}
    ), '[]'::jsonb) as expenses
  `;
  return (rows[0]?.expenses ?? []) as ExpenseLine[];
}
