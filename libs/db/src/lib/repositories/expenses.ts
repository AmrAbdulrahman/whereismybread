import { and, eq } from 'drizzle-orm';
import { getDb, getSql } from '../client';
import {
  budgets,
  expenses,
  expenseTags,
  type Expense,
} from '../schema/budgets';
import { accounts, banks } from '../schema/payments';

export interface ExpenseInput {
  /** `null` — the expense isn't tracked against any budget. */
  budgetId: string | null;
  /** `null` — not assigned to any account. */
  accountId: string | null;
  /** `null` — not assigned to any bank. */
  bankId: string | null;
  name: string;
  /** `YYYY-MM-DD`. */
  date: string;
  amountMinor: number;
  currency: string;
  notes: string | null;
  /** Provider website + branding fetched from it. */
  url: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  /** Tag ids to link — the caller resolves names first (`getOrCreateTags`). */
  tagIds: string[];
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

/** `true` when `accountId` is unset, or is an account this user owns. */
async function ownsAccountOrNone(
  userId: string,
  accountId: string | null,
): Promise<boolean> {
  if (!accountId) return true;
  const owned = await getDb()
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);
  return owned.length > 0;
}

/** `true` when `bankId` is unset, or is a bank this user owns. */
async function ownsBankOrNone(
  userId: string,
  bankId: string | null,
): Promise<boolean> {
  if (!bankId) return true;
  const owned = await getDb()
    .select({ id: banks.id })
    .from(banks)
    .where(and(eq(banks.id, bankId), eq(banks.userId, userId)))
    .limit(1);
  return owned.length > 0;
}

/** Insert an expense — returns `null` if a given budget/account isn't the user's. */
export async function createExpense(
  userId: string,
  input: ExpenseInput,
): Promise<Expense | null> {
  if (!(await ownsBudgetOrNone(userId, input.budgetId))) return null;
  if (!(await ownsAccountOrNone(userId, input.accountId))) return null;
  if (!(await ownsBankOrNone(userId, input.bankId))) return null;

  return getDb().transaction(async (tx) => {
    const rows = await tx
      .insert(expenses)
      .values({
        userId,
        budgetId: input.budgetId,
        accountId: input.accountId,
        bankId: input.bankId,
        name: input.name.trim(),
        date: input.date,
        amountMinor: input.amountMinor,
        currency: input.currency,
        notes: input.notes,
        url: input.url,
        logoUrl: input.logoUrl,
        brandColor: input.brandColor,
      })
      .returning();
    const expense = rows[0];
    if (!expense) return null;
    if (input.tagIds.length > 0) {
      await tx
        .insert(expenseTags)
        .values(input.tagIds.map((tagId) => ({ expenseId: expense.id, tagId })))
        .onConflictDoNothing();
    }
    return expense;
  });
}

/**
 * Update an expense, optionally reassigning its budget/account or clearing
 * either to none. Tags are replaced wholesale.
 */
export async function updateExpense(
  userId: string,
  id: string,
  input: ExpenseInput,
): Promise<Expense | null> {
  if (!(await ownsBudgetOrNone(userId, input.budgetId))) return null;
  if (!(await ownsAccountOrNone(userId, input.accountId))) return null;
  if (!(await ownsBankOrNone(userId, input.bankId))) return null;

  return getDb().transaction(async (tx) => {
    const rows = await tx
      .update(expenses)
      .set({
        budgetId: input.budgetId,
        accountId: input.accountId,
        bankId: input.bankId,
        name: input.name.trim(),
        date: input.date,
        amountMinor: input.amountMinor,
        currency: input.currency,
        notes: input.notes,
        url: input.url,
        logoUrl: input.logoUrl,
        brandColor: input.brandColor,
        updatedAt: new Date(),
      })
      .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
      .returning();
    const expense = rows[0];
    if (!expense) return null;

    await tx.delete(expenseTags).where(eq(expenseTags.expenseId, id));
    if (input.tagIds.length > 0) {
      await tx
        .insert(expenseTags)
        .values(input.tagIds.map((tagId) => ({ expenseId: id, tagId })))
        .onConflictDoNothing();
    }
    return expense;
  });
}

/** Link tags onto an expense (additive) — used by the automations engine. */
export async function addExpenseTags(
  userId: string,
  id: string,
  tagIds: string[],
): Promise<void> {
  if (tagIds.length === 0) return;
  const owned = await getDb()
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .limit(1);
  if (!owned[0]) return;
  await getDb()
    .insert(expenseTags)
    .values(tagIds.map((tagId) => ({ expenseId: id, tagId })))
    .onConflictDoNothing();
}

/** Set (or clear) an expense's account — used by the automations engine. */
export async function setExpenseAccount(
  userId: string,
  id: string,
  accountId: string | null,
): Promise<void> {
  if (accountId && !(await ownsAccountOrNone(userId, accountId))) return;
  await getDb()
    .update(expenses)
    .set({ accountId, updatedAt: new Date() })
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)));
}

export interface ExpenseWithMeta extends Expense {
  tagIds: string[];
}

export async function getExpense(
  userId: string,
  id: string,
): Promise<ExpenseWithMeta | null> {
  const rows = await getDb()
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .limit(1);
  const expense = rows[0];
  if (!expense) return null;
  const links = await getDb()
    .select({ tagId: expenseTags.tagId })
    .from(expenseTags)
    .where(eq(expenseTags.expenseId, id));
  return { ...expense, tagIds: links.map((l) => l.tagId) };
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

export interface ExpenseLineTag {
  id: string;
  name: string;
  color: string;
}

/** An expense resolved for the plan board — its budget's name/colour inlined. */
export interface ExpenseLine {
  id: string;
  name: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** ISO timestamp when the expense came from a timed bank transaction; else null. */
  occurredAt: string | null;
  amountMinor: number;
  currency: string;
  notes: string | null;
  url: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  budgetId: string | null;
  budgetName: string | null;
  budgetColor: string | null;
  accountId: string | null;
  accountName: string | null;
  accountColor: string | null;
  bankId: string | null;
  bankName: string | null;
  bankColor: string | null;
  bankIconKey: string | null;
  bankLogoUrl: string | null;
  tags: ExpenseLineTag[];
  attachments: ExpenseLineAttachment[];
}

/**
 * Every expense the user has (budgeted or not) — one round trip, its
 * budget/account name+colour and tags joined straight in. Expenses are
 * discrete rows (not generated recurrence occurrences like payments), so
 * unlike the plan board there's no window to page through — this stays a
 * bounded, cheap fetch for the whole account.
 */
export async function listExpenses(userId: string): Promise<ExpenseLine[]> {
  const sql = getSql();
  const rows = await sql<Array<{ expenses: unknown }>>`
    select coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id, 'name', e.name, 'date', e.date,
          'occurredAt', e.occurred_at,
          'amountMinor', e.amount_minor, 'currency', e.currency,
          'notes', e.notes,
          'url', e.url, 'logoUrl', e.logo_url, 'brandColor', e.brand_color,
          'budgetId', e.budget_id, 'budgetName', b.name, 'budgetColor', b.color,
          'accountId', e.account_id, 'accountName', ac.name, 'accountColor', ac.color,
          'bankId', e.bank_id, 'bankName', bk.name, 'bankColor', bk.color,
          'bankIconKey', bk.icon_key, 'bankLogoUrl', bk.logo_url,
          'tags', coalesce((
            select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color)
              order by t.name)
            from expense_tags et join tags t on t.id = et.tag_id
            where et.expense_id = e.id
          ), '[]'::jsonb),
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
      left join accounts ac on ac.id = e.account_id
      left join banks bk on bk.id = e.bank_id
      where e.user_id = ${userId}
    ), '[]'::jsonb) as expenses
  `;
  return (rows[0]?.expenses ?? []) as ExpenseLine[];
}
