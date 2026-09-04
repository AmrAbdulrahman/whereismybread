import { requireUserId } from '@wib/auth/server';
import { listExpenses } from '@wib/db';
import { money } from '@wib/domain';
import type { ExpenseLine } from './types';

/** Every expense the signed-in user has (budgeted or not). */
export async function getExpensesData(): Promise<ExpenseLine[]> {
  const userId = await requireUserId();
  const rows = await listExpenses(userId);
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    date: e.date,
    amount: money(e.amountMinor, e.currency),
    notes: e.notes,
    budgetId: e.budgetId,
    budgetName: e.budgetName,
    budgetColor: e.budgetColor,
    attachments: e.attachments,
  }));
}
