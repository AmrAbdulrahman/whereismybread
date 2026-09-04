import { and, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { budgets, expenses, type Expense } from '../schema/budgets';

export interface ExpenseInput {
  budgetId: string;
  name: string;
  amountMinor: number;
  currency: string;
  notes: string | null;
}

/** Insert an expense — returns `null` if the budget isn't the user's. */
export async function createExpense(
  userId: string,
  input: ExpenseInput,
): Promise<Expense | null> {
  const owned = await getDb()
    .select({ id: budgets.id })
    .from(budgets)
    .where(and(eq(budgets.id, input.budgetId), eq(budgets.userId, userId)))
    .limit(1);
  if (!owned[0]) return null;

  const rows = await getDb()
    .insert(expenses)
    .values({
      userId,
      budgetId: input.budgetId,
      name: input.name.trim(),
      amountMinor: input.amountMinor,
      currency: input.currency,
      notes: input.notes,
    })
    .returning();
  return rows[0] ?? null;
}

/**
 * Update an expense, optionally reassigning it to a different (owned) budget.
 */
export async function updateExpense(
  userId: string,
  id: string,
  input: ExpenseInput,
): Promise<Expense | null> {
  const owned = await getDb()
    .select({ id: budgets.id })
    .from(budgets)
    .where(and(eq(budgets.id, input.budgetId), eq(budgets.userId, userId)))
    .limit(1);
  if (!owned[0]) return null;

  const rows = await getDb()
    .update(expenses)
    .set({
      budgetId: input.budgetId,
      name: input.name.trim(),
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
