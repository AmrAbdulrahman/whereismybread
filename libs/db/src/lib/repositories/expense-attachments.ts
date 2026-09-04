import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../client';
import {
  expenseAttachments,
  expenses,
  type ExpenseAttachment,
} from '../schema/budgets';

export interface ExpenseAttachmentInput {
  expenseId: string;
  name: string;
  contentType: string;
  size: number;
  url: string;
  pathname: string;
}

/** Insert an attachment row — the caller has already uploaded the blob. */
export async function addExpenseAttachment(
  userId: string,
  input: ExpenseAttachmentInput,
): Promise<ExpenseAttachment | null> {
  const owned = await getDb()
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.id, input.expenseId), eq(expenses.userId, userId)))
    .limit(1);
  if (!owned[0]) return null;

  const rows = await getDb()
    .insert(expenseAttachments)
    .values({ userId, ...input })
    .returning();
  return rows[0] ?? null;
}

/** Delete one attachment row, returning it so the caller can remove the blob. */
export async function deleteExpenseAttachment(
  userId: string,
  id: string,
): Promise<ExpenseAttachment | null> {
  const rows = await getDb()
    .delete(expenseAttachments)
    .where(
      and(eq(expenseAttachments.id, id), eq(expenseAttachments.userId, userId)),
    )
    .returning();
  return rows[0] ?? null;
}

/**
 * Make an expense's attachments match `desired` (keyed by `pathname`): insert
 * the new ones, delete the rest. Returns the rows removed, for blob cleanup.
 */
export async function reconcileExpenseAttachments(
  userId: string,
  expenseId: string,
  desired: Omit<ExpenseAttachmentInput, 'expenseId'>[],
): Promise<{ removed: ExpenseAttachment[] }> {
  const existing = await getDb()
    .select()
    .from(expenseAttachments)
    .where(
      and(
        eq(expenseAttachments.userId, userId),
        eq(expenseAttachments.expenseId, expenseId),
      ),
    );

  const keep = new Set(desired.map((d) => d.pathname));
  const have = new Set(existing.map((e) => e.pathname));

  const toRemove = existing.filter((e) => !keep.has(e.pathname));
  const toAdd = desired.filter((d) => !have.has(d.pathname));

  if (toRemove.length > 0) {
    await getDb()
      .delete(expenseAttachments)
      .where(
        inArray(
          expenseAttachments.id,
          toRemove.map((r) => r.id),
        ),
      );
  }
  if (toAdd.length > 0) {
    await getDb()
      .insert(expenseAttachments)
      .values(toAdd.map((d) => ({ userId, expenseId, ...d })));
  }

  return { removed: toRemove };
}
