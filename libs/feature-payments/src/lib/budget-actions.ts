'use server';

import { requireUserId } from '@wib/auth/server';
import { fieldErrors, type FormState } from '@wib/auth';
import { del, put } from '@vercel/blob';
import {
  addExpenseAttachment,
  createBudget,
  createExpense,
  deleteBudget,
  deleteExpense,
  deleteExpenseAttachment,
  reconcileExpenseAttachments,
  updateBudget,
  updateExpense,
  type Budget,
  type Expense,
  type ExpenseAttachment,
} from '@wib/db';
import { parseMoneyInput } from '@wib/domain';
import { revalidatePath } from 'next/cache';
import { budgetFormSchema, type BudgetFormValues } from './budget-schema';
import { expenseFormSchema, type ExpenseFormValues } from './expense-schema';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  isBlobUrl,
  resolveAttachmentType,
} from './attachments';
import type { AttachmentDraft } from './types';

function revalidateBudgets() {
  revalidatePath('/budgets');
  revalidatePath('/plan');
}

// --- Budgets -----------------------------------------------------------

export async function saveBudgetAction(
  id: string | null,
  values: BudgetFormValues,
): Promise<FormState & { item?: Budget }> {
  const userId = await requireUserId();
  const parsed = budgetFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  let amountMinor: number;
  try {
    amountMinor = parseMoneyInput(
      parsed.data.amount,
      parsed.data.currency,
    ).minorUnits;
  } catch {
    return { ok: false, fieldErrors: { amount: ['Not a valid amount'] } };
  }

  const input = {
    name: parsed.data.name,
    period: parsed.data.period,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
    amountMinor,
    currency: parsed.data.currency,
    color: parsed.data.color,
    recurring: parsed.data.recurring,
  };

  const budget = id
    ? await updateBudget(userId, id, input)
    : await createBudget(userId, input);
  if (!budget) return { ok: false, error: 'That budget no longer exists.' };

  revalidateBudgets();
  return { ok: true, item: budget };
}

export async function deleteBudgetAction(id: string): Promise<FormState> {
  const userId = await requireUserId();
  if (typeof id !== 'string' || !id) {
    return { ok: false, error: 'That budget no longer exists.' };
  }
  await deleteBudget(userId, id);
  revalidateBudgets();
  return { ok: true };
}

// --- Expenses ------------------------------------------------------------

/** Keep only well-formed drafts pointing at our blob store with an allowed type. */
function validAttachmentDrafts(
  drafts: readonly AttachmentDraft[],
): AttachmentDraft[] {
  return (Array.isArray(drafts) ? drafts : [])
    .filter(
      (d) =>
        d &&
        typeof d.url === 'string' &&
        isBlobUrl(d.url) &&
        typeof d.pathname === 'string' &&
        d.pathname.length > 0 &&
        typeof d.contentType === 'string' &&
        d.contentType in ATTACHMENT_TYPES &&
        Number.isFinite(d.size) &&
        d.size >= 0 &&
        d.size <= ATTACHMENT_MAX_BYTES,
    )
    .slice(0, 20)
    .map((d) => ({
      name: String(d.name || 'file').slice(0, 255),
      contentType: d.contentType,
      size: Math.round(d.size),
      url: d.url,
      pathname: d.pathname,
    }));
}

export async function saveExpenseAction(
  id: string | null,
  values: ExpenseFormValues,
): Promise<FormState & { item?: Expense }> {
  const userId = await requireUserId();
  const parsed = expenseFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  let amountMinor: number;
  try {
    amountMinor = parseMoneyInput(
      parsed.data.amount,
      parsed.data.currency,
    ).minorUnits;
  } catch {
    return { ok: false, fieldErrors: { amount: ['Not a valid amount'] } };
  }

  const input = {
    budgetId: parsed.data.budgetId,
    name: parsed.data.name,
    date: parsed.data.date,
    amountMinor,
    currency: parsed.data.currency,
    notes: parsed.data.notes,
  };
  const budgetGoneError = 'That budget no longer exists.';

  if (!id) {
    const expense = await createExpense(userId, input);
    if (!expense) return { ok: false, error: budgetGoneError };
    // Files staged while creating — attach them to the fresh expense.
    const drafts = validAttachmentDrafts(parsed.data.attachments);
    if (drafts.length > 0) {
      await reconcileExpenseAttachments(userId, expense.id, drafts).catch(
        () => undefined,
      );
    }
    revalidateBudgets();
    return { ok: true, item: expense };
  }

  const expense = await updateExpense(userId, id, input);
  if (!expense) {
    return {
      ok: false,
      error: parsed.data.budgetId ? budgetGoneError : 'That expense no longer exists.',
    };
  }
  revalidateBudgets();
  return { ok: true, item: expense };
}

export async function deleteExpenseAction(id: string): Promise<FormState> {
  const userId = await requireUserId();
  if (typeof id !== 'string' || !id) {
    return { ok: false, error: 'That expense no longer exists.' };
  }
  await deleteExpense(userId, id);
  revalidateBudgets();
  return { ok: true };
}

// --- Expense attachments ---------------------------------------------------

const SAFE_NAME = /[^\w.\- ]+/g;

/**
 * Upload a file to Vercel Blob and, when editing an existing expense, record
 * it straight away. When creating (`expenseId` null) the blob is stored and
 * its details returned as a draft — the form stages it and `saveExpenseAction`
 * writes the row once the expense exists.
 */
export async function uploadExpenseAttachmentAction(
  expenseId: string | null,
  form: FormData,
): Promise<
  | { ok: true; draft: AttachmentDraft; attachment: ExpenseAttachment | null }
  | { ok: false; error: string }
> {
  const userId = await requireUserId();

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No file received.' };
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: 'That file is too large (max 10 MB).' };
  }
  const contentType = resolveAttachmentType(file.name, file.type);
  if (!contentType) {
    return { ok: false, error: 'Only images, PDFs and text files are allowed.' };
  }

  const safeName = file.name.replace(SAFE_NAME, '_').slice(0, 120) || 'file';
  const blob = await put(
    `expenses/${userId}/${crypto.randomUUID()}-${safeName}`,
    file,
    { access: 'private', contentType, addRandomSuffix: false },
  );

  const draft: AttachmentDraft = {
    name: file.name.slice(0, 255),
    contentType,
    size: file.size,
    url: blob.url,
    pathname: blob.pathname,
  };

  if (!expenseId) return { ok: true, draft, attachment: null };

  const attachment = await addExpenseAttachment(userId, { expenseId, ...draft });
  if (!attachment) {
    await del(blob.url).catch(() => undefined);
    return { ok: false, error: 'That expense no longer exists.' };
  }
  revalidateBudgets();
  return { ok: true, draft, attachment };
}

export async function removeExpenseAttachmentAction(
  id: string,
): Promise<FormState> {
  const userId = await requireUserId();
  if (typeof id !== 'string' || !id) {
    return { ok: false, error: 'Bad attachment.' };
  }
  const row = await deleteExpenseAttachment(userId, id);
  if (row) await del(row.url).catch(() => undefined);
  revalidateBudgets();
  return { ok: true };
}
