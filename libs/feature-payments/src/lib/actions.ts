'use server';

import { requireUser, requireUserId } from '@wib/auth/server';
import { fieldErrors, type FormState } from '@wib/auth';
import {
  clearMonthIncome,
  clearOccurrence,
  createAccount,
  createBank,
  createPayment,
  createPaymentMethod,
  createRecipientMethod,
  deletePaymentFrom,
  getOrCreateTags,
  getPayment,
  markOccurrence,
  setMonthIncome,
  setOccurrenceOverride,
  splitPaymentForward,
  updatePayment,
  type Account,
  type Bank,
  type PaymentMethod,
  type PaymentOverrides,
  type RecipientMethod,
} from '@wib/db';
import {
  anchorForDayOfMonth,
  parseMoneyInput,
  startOfMonth,
  todayIn,
} from '@wib/domain';
import { revalidatePath } from 'next/cache';
import {
  getPaymentBoard,
  getPaymentsContext,
} from './queries';
import type { PaymentBoard } from './types';
import { paymentFormSchema, type PaymentFormValues } from './schema';
import { methodFormSchema, type MethodFormValues } from './method-schema';
import {
  recipientMethodFormSchema,
  type RecipientMethodFormValues,
} from './recipient-method-schema';
import { accountFormSchema, type AccountFormValues } from './account-schema';
import { bankFormSchema, type BankFormValues } from './bank-schema';
import { fetchBranding, type Branding } from './branding';

/**
 * Which occurrences an edit/delete of a recurring payment applies to:
 *  - `this`   → only the occurrence the user opened
 *  - `future` → that occurrence and every later one (earlier months untouched)
 */
export type EditScope = 'this' | 'future';

export interface ScopeInput {
  scope: EditScope;
  /** The `YYYY-MM-DD` due date of the occurrence the user acted on. */
  occurrenceDate: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeScope(input?: ScopeInput): ScopeInput | null {
  if (
    input &&
    (input.scope === 'this' || input.scope === 'future') &&
    typeof input.occurrenceDate === 'string' &&
    ISO_DATE.test(input.occurrenceDate)
  ) {
    return input;
  }
  return null;
}

export async function savePaymentAction(
  paymentId: string | null,
  values: PaymentFormValues,
  scopeInput?: ScopeInput,
): Promise<FormState> {
  const user = await requireUser();
  const userId = user.id;
  const today = todayIn(user.timezone);

  const parsed = paymentFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  const v = parsed.data;

  let amountMinor: number;
  try {
    amountMinor = parseMoneyInput(v.amount, v.currency).minorUnits;
  } catch {
    return { ok: false, fieldErrors: { amount: ['Not a valid amount'] } };
  }

  const tags = await getOrCreateTags(userId, v.tags);
  const oneTime = v.recurrence === 'one_time';
  // Every recurring payment is a subscription now (no toggle).
  const isSub = !oneTime;
  const perUnit = v.amountKind === 'per_unit';
  const units = Number(String(v.defaultUnits).replace(/[, ]/g, '') || '1');
  const domDay = Math.min(31, Math.max(1, Number(v.dayOfMonth || '1') || 1));

  const feeKind = v.feeKind;
  let feeFixedMinor = 0;
  let feePercent = 0;
  if (feeKind === 'fixed') {
    try {
      feeFixedMinor = parseMoneyInput(v.feeValue || '0', v.currency).minorUnits;
    } catch {
      return { ok: false, fieldErrors: { feeValue: ['Not a valid amount'] } };
    }
  } else if (feeKind === 'percent') {
    feePercent = Number(v.feeValue.replace(/[,% ]/g, '') || '0');
  }

  const input = {
    name: v.name,
    amountKind: perUnit ? ('per_unit' as const) : ('fixed' as const),
    amountMinor,
    unitName: perUnit ? v.unitName : null,
    defaultUnits: perUnit ? units : 1,
    feeKind,
    feeFixedMinor,
    feePercent,
    currency: v.currency,
    methodId: v.methodId,
    accountId: v.accountId,
    bankId: v.bankId,
    recipientMethodId: v.recipientMethodId,
    recurrence: v.recurrence,
    // Recurring: start on the chosen day of the month (soonest upcoming for a
    // new series; the existing series' month when editing — see below).
    anchorDate: oneTime ? v.anchorDate : anchorForDayOfMonth(domDay, today),
    dayOfMonth: oneTime ? null : domDay,
    endsOn: oneTime ? null : v.endsOn,
    // The provider link + its branding belong to the subscription toggle.
    url: isSub ? v.url : null,
    logoUrl: isSub ? v.logoUrl : null,
    brandColor: isSub ? v.brandColor : null,
    isSubscription: isSub,
    notes: v.notes,
    tagIds: tags.map((t) => t.id),
  };

  if (!paymentId) {
    await createPayment(userId, input);
    revalidatePath('/plan');
    return { ok: true };
  }

  const original = await getPayment(userId, paymentId);
  if (!original) return { ok: false, error: 'That payment no longer exists.' };

  // Editing a recurring series: keep its start month, just move the day.
  if (!oneTime && original.recurrence !== 'one_time') {
    input.anchorDate = anchorForDayOfMonth(domDay, today, original.anchorDate);
  }

  const scope = normalizeScope(scopeInput);

  // One-time payment, or no per-occurrence context → plain in-place edit.
  if (original.recurrence === 'one_time' || scope == null) {
    await updatePayment(userId, paymentId, input);
    revalidatePath('/plan');
    return { ok: true };
  }

  if (scope.scope === 'future') {
    await splitPaymentForward(userId, paymentId, scope.occurrenceDate, input);
    revalidatePath('/plan');
    return { ok: true };
  }

  // `this` month only → store what differs from the series as an override.
  const overrides: PaymentOverrides = {};
  if (input.name !== original.name) overrides.name = input.name;
  if (input.amountMinor !== original.amountMinor)
    overrides.amountMinor = input.amountMinor;
  if (perUnit && input.defaultUnits !== original.defaultUnits)
    overrides.units = input.defaultUnits;
  if (input.currency !== original.currency) overrides.currency = input.currency;
  if (input.methodId !== original.methodId) overrides.methodId = input.methodId;
  if (input.accountId !== original.accountId)
    overrides.accountId = input.accountId;
  if (input.bankId !== original.bankId) overrides.bankId = input.bankId;
  if (input.recipientMethodId !== original.recipientMethodId)
    overrides.recipientMethodId = input.recipientMethodId;
  if ((input.notes ?? null) !== (original.notes ?? null))
    overrides.notes = input.notes ?? null;

  await setOccurrenceOverride(userId, {
    paymentId,
    dueDate: scope.occurrenceDate,
    overrides,
  });
  revalidatePath('/plan');
  return { ok: true };
}

export async function createMethodAction(
  values: MethodFormValues,
): Promise<FormState & { method?: PaymentMethod }> {
  const userId = await requireUserId();

  const parsed = methodFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  const method = await createPaymentMethod(userId, parsed.data);
  revalidatePath('/plan');
  return { ok: true, method };
}

export async function createRecipientMethodAction(
  values: RecipientMethodFormValues,
): Promise<FormState & { recipientMethod?: RecipientMethod }> {
  const userId = await requireUserId();

  const parsed = recipientMethodFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  const recipientMethod = await createRecipientMethod(userId, parsed.data);
  revalidatePath('/plan');
  return { ok: true, recipientMethod };
}

export async function createAccountAction(
  values: AccountFormValues,
): Promise<FormState & { account?: Account }> {
  const userId = await requireUserId();

  const parsed = accountFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  const account = await createAccount(userId, parsed.data);
  revalidatePath('/plan');
  return { ok: true, account };
}

export async function createBankAction(
  values: BankFormValues,
): Promise<FormState & { bank?: Bank }> {
  const userId = await requireUserId();

  const parsed = bankFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  const bank = await createBank(userId, parsed.data);
  revalidatePath('/plan');
  return { ok: true, bank };
}

export async function fetchBrandingAction(
  url: string,
): Promise<{ ok: true; branding: Branding } | { ok: false; error: string }> {
  await requireUserId();
  if (typeof url !== 'string' || url.trim().length < 3 || url.length > 2048) {
    return { ok: false, error: 'Enter a website first.' };
  }
  try {
    const branding = await fetchBranding(url);
    if (!branding.logoUrl && !branding.color && !branding.name) {
      return { ok: false, error: 'Couldn’t find any branding on that site.' };
    }
    return { ok: true, branding };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'Couldn’t reach that site.',
    };
  }
}

/**
 * Delete a payment. With `scope: 'this'` on a recurring payment, only the one
 * occurrence is dropped (a "skipped" marker). Otherwise the series is removed
 * from that occurrence's month onward, keeping every earlier month intact.
 */
export async function deletePaymentAction(
  paymentId: string,
  scopeInput?: ScopeInput,
): Promise<FormState> {
  const user = await requireUser();
  const scope = normalizeScope(scopeInput);

  const original = await getPayment(user.id, paymentId);
  if (!original) return { ok: false, error: 'That payment no longer exists.' };

  if (scope?.scope === 'this' && original.recurrence !== 'one_time') {
    await markOccurrence(user.id, {
      paymentId,
      dueDate: scope.occurrenceDate,
      status: 'skipped',
    });
    revalidatePath('/plan');
    return { ok: true, message: 'This occurrence removed.' };
  }

  const cutoff = scope
    ? startOfMonth(scope.occurrenceDate)
    : startOfMonth(todayIn(user.timezone));
  const result = await deletePaymentFrom(user.id, paymentId, cutoff);
  revalidatePath('/plan');
  return {
    ok: true,
    message: result.removed
      ? 'Deleted.'
      : 'Removed from that month on. Earlier months are kept.',
  };
}

/**
 * Load a board slice for an arbitrary date window — the list view calls this as
 * you scroll past its ends to pull in earlier / later months.
 */
export async function loadListWindowAction(range: {
  from: string;
  to: string;
}): Promise<
  { ok: true; board: PaymentBoard } | { ok: false; error: string }
> {
  await requireUserId();
  if (
    !range ||
    typeof range.from !== 'string' ||
    typeof range.to !== 'string' ||
    !ISO_DATE.test(range.from) ||
    !ISO_DATE.test(range.to) ||
    range.from > range.to
  ) {
    return { ok: false, error: 'Bad range.' };
  }
  // Cap the span so a client can't ask for a decade of expansion in one call.
  const maxTo = `${Number(range.from.slice(0, 4)) + 6}${range.from.slice(4)}`;
  const to = range.to > maxTo ? maxTo : range.to;

  const ctx = await getPaymentsContext();
  const board = await getPaymentBoard(ctx, { from: range.from, to });
  return { ok: true, board };
}

export async function markOccurrenceAction(input: {
  paymentId: string;
  dueDate: string;
  status: 'paid' | 'skipped';
}): Promise<FormState> {
  const userId = await requireUserId();
  await markOccurrence(userId, input);
  revalidatePath('/plan');
  return { ok: true };
}

export async function clearOccurrenceAction(
  paymentId: string,
  dueDate: string,
): Promise<FormState> {
  const userId = await requireUserId();
  await clearOccurrence(userId, paymentId, dueDate);
  revalidatePath('/plan');
  return { ok: true };
}

const ISO_MONTH = /^\d{4}-\d{2}$/;

/**
 * Override the income for one month (`YYYY-MM`). Pass `{ amount }` in fixed
 * mode, or `{ hours }` in hourly mode.
 */
export async function setMonthIncomeAction(
  month: string,
  input: { amount?: string; currency?: string; hours?: string },
): Promise<FormState> {
  const user = await requireUser();
  if (typeof month !== 'string' || !ISO_MONTH.test(month)) {
    return { ok: false, error: 'Not a valid month.' };
  }

  if (input.hours != null) {
    const hours = Number(String(input.hours).replace(/[, ]/g, '') || '0');
    if (!Number.isFinite(hours) || hours < 0) {
      return { ok: false, fieldErrors: { hours: ['Not a valid number'] } };
    }
    await setMonthIncome(user.id, month, { hours });
    revalidatePath('/plan');
    return { ok: true };
  }

  const currency =
    typeof input.currency === 'string' && input.currency.trim().length === 3
      ? input.currency.trim().toUpperCase()
      : user.incomeCurrency;
  let amountMinor: number;
  try {
    amountMinor = parseMoneyInput(input.amount || '0', currency).minorUnits;
  } catch {
    return { ok: false, fieldErrors: { amount: ['Not a valid amount'] } };
  }
  if (amountMinor < 0) {
    return { ok: false, fieldErrors: { amount: ['Cannot be negative'] } };
  }
  await setMonthIncome(user.id, month, { amountMinor, currency });
  revalidatePath('/plan');
  return { ok: true };
}

/** Drop a month's income override — it falls back to the global setting. */
export async function resetMonthIncomeAction(month: string): Promise<FormState> {
  const userId = await requireUserId();
  if (typeof month !== 'string' || !ISO_MONTH.test(month)) {
    return { ok: false, error: 'Not a valid month.' };
  }
  await clearMonthIncome(userId, month);
  revalidatePath('/plan');
  return { ok: true };
}

/** Drop a per-month override, returning the occurrence to the series default. */
export async function resetOccurrenceAction(
  paymentId: string,
  dueDate: string,
): Promise<FormState> {
  const userId = await requireUserId();
  await setOccurrenceOverride(userId, { paymentId, dueDate, overrides: {} });
  revalidatePath('/plan');
  return { ok: true };
}
