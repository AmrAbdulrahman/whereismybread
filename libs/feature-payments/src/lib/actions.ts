'use server';

import { requireUser, requireUserId } from '@wib/auth/server';
import { fieldErrors, type FormState } from '@wib/auth';
import { del, put } from '@vercel/blob';
import {
  addAttachment,
  clearMonthIncome,
  clearOccurrence,
  createAccount,
  createBank,
  createPayment,
  createPaymentMethod,
  createRecipientMethod,
  deleteAccount,
  deleteAttachment,
  deleteBank,
  deletePaymentFrom,
  getAccountByName,
  getBankByName,
  getOrCreateTags,
  getPaymentRow,
  getRates,
  listAccountsWithUsage,
  listBanksWithUsage,
  markOccurrence,
  reconcileAttachments,
  setMonthIncome,
  setOccurrenceOverride,
  splitPaymentForward,
  updateAccount,
  updateBank,
  updatePayment,
  type Account,
  type AccountWithUsage,
  type Bank,
  type BankWithUsage,
  type PaymentAttachment,
  type PaymentLineItem,
  type PaymentMethod,
  type PaymentOverrides,
  type RecipientMethod,
} from '@wib/db';
import {
  anchorForDayOfMonth,
  convertMoney,
  money,
  parseMoneyInput,
  startOfMonth,
  todayIn,
} from '@wib/domain';
import { revalidatePath } from 'next/cache';
import { getBoardData } from './queries';
import type { PaymentBoard } from './types';
import { paymentFormSchema, type PaymentFormValues } from './schema';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  isBlobUrl,
  resolveAttachmentType,
} from './attachments';
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
  const isGroup = v.amountKind === 'group';

  // Group records → typed rows, and a snapshot of their sum (in the payment
  // currency, at today's rates) for `amount_minor`. The board recomputes it
  // live on every render, so drift between saves is cosmetic only.
  let lineItems: PaymentLineItem[] | null = null;
  let amountMinor: number;
  if (isGroup) {
    try {
      lineItems = v.lineItems.map((li) => ({
        id: li.id,
        name: li.name,
        valueMinor: parseMoneyInput(li.value, li.currency).minorUnits,
        currency: li.currency,
        iconKey: li.iconKey,
        logoUrl: li.logoUrl,
        color: li.color,
      }));
    } catch {
      return { ok: false, fieldErrors: { lineItems: ['A record has a bad value'] } };
    }
    const rates = await getRates();
    amountMinor = lineItems.reduce((sum, li) => {
      const c = convertMoney(money(li.valueMinor, li.currency), v.currency, rates);
      return c.currency === v.currency.toUpperCase() ? sum + c.minorUnits : sum;
    }, 0);
  } else {
    try {
      amountMinor = parseMoneyInput(v.amount, v.currency).minorUnits;
    } catch {
      return { ok: false, fieldErrors: { amount: ['Not a valid amount'] } };
    }
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
    amountKind: isGroup
      ? ('group' as const)
      : perUnit
        ? ('per_unit' as const)
        : ('fixed' as const),
    amountMinor,
    lineItems,
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
    const created = await createPayment(userId, input);
    // Files the user staged while creating — attach them to the fresh payment.
    const drafts = validAttachmentDrafts(v.attachments);
    if (drafts.length > 0) {
      // The payment saved; a failed attach shouldn't roll that back.
      await reconcileAttachments(userId, created.id, drafts).catch(
        () => undefined,
      );
    }
    revalidatePath('/plan');
    return { ok: true };
  }

  const original = await getPaymentRow(userId, paymentId);
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
  if (!isGroup && input.amountMinor !== original.amountMinor)
    overrides.amountMinor = input.amountMinor;
  if (perUnit && input.defaultUnits !== original.defaultUnits)
    overrides.units = input.defaultUnits;
  if (
    isGroup &&
    JSON.stringify(input.lineItems ?? []) !==
      JSON.stringify(original.lineItems ?? [])
  )
    overrides.lineItems = input.lineItems;
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

// --- Account / bank management (the /accounts + /banks pages) --------------

/** The `{id,name,color}` a manager row needs, plus its payment count. */
export interface LabelRow {
  id: string;
  name: string;
  color: string;
  paymentCount: number;
}

const toLabelRows = (
  rows: AccountWithUsage[] | BankWithUsage[],
): LabelRow[] =>
  rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    paymentCount: r.paymentCount,
  }));

export async function saveAccountAction(
  id: string | null,
  values: AccountFormValues,
): Promise<FormState & { item?: LabelRow }> {
  const userId = await requireUserId();
  const parsed = accountFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  if (!id) {
    if (await getAccountByName(userId, parsed.data.name)) {
      return {
        ok: false,
        fieldErrors: { name: ['You already have an account with that name'] },
      };
    }
    const account = await createAccount(userId, parsed.data);
    revalidatePath('/accounts');
    revalidatePath('/plan');
    return {
      ok: true,
      item: { id: account.id, name: account.name, color: account.color, paymentCount: 0 },
    };
  }

  const account = await updateAccount(userId, id, parsed.data);
  if (!account) {
    return {
      ok: false,
      fieldErrors: { name: ['You already have an account with that name'] },
    };
  }
  revalidatePath('/accounts');
  revalidatePath('/plan');
  return {
    ok: true,
    item: { id: account.id, name: account.name, color: account.color, paymentCount: 0 },
  };
}

export async function deleteAccountAction(id: string): Promise<FormState> {
  const userId = await requireUserId();
  if (typeof id !== 'string' || !id) {
    return { ok: false, error: 'That account no longer exists.' };
  }
  await deleteAccount(userId, id);
  revalidatePath('/accounts');
  revalidatePath('/plan');
  return { ok: true };
}

export async function listAccountsAction(): Promise<LabelRow[]> {
  const userId = await requireUserId();
  return toLabelRows(await listAccountsWithUsage(userId));
}

export async function saveBankAction(
  id: string | null,
  values: BankFormValues,
): Promise<FormState & { item?: LabelRow }> {
  const userId = await requireUserId();
  const parsed = bankFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  if (!id) {
    if (await getBankByName(userId, parsed.data.name)) {
      return {
        ok: false,
        fieldErrors: { name: ['You already have a bank with that name'] },
      };
    }
    const bank = await createBank(userId, parsed.data);
    revalidatePath('/banks');
    revalidatePath('/plan');
    return {
      ok: true,
      item: { id: bank.id, name: bank.name, color: bank.color, paymentCount: 0 },
    };
  }

  const bank = await updateBank(userId, id, parsed.data);
  if (!bank) {
    return {
      ok: false,
      fieldErrors: { name: ['You already have a bank with that name'] },
    };
  }
  revalidatePath('/banks');
  revalidatePath('/plan');
  return {
    ok: true,
    item: { id: bank.id, name: bank.name, color: bank.color, paymentCount: 0 },
  };
}

export async function deleteBankAction(id: string): Promise<FormState> {
  const userId = await requireUserId();
  if (typeof id !== 'string' || !id) {
    return { ok: false, error: 'That bank no longer exists.' };
  }
  await deleteBank(userId, id);
  revalidatePath('/banks');
  revalidatePath('/plan');
  return { ok: true };
}

export async function listBanksAction(): Promise<LabelRow[]> {
  const userId = await requireUserId();
  return toLabelRows(await listBanksWithUsage(userId));
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

  const original = await getPaymentRow(user.id, paymentId);
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

  const { board } = await getBoardData({ from: range.from, to });
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

// --- Attachments -----------------------------------------------------------

export interface AttachmentDraft {
  name: string;
  contentType: string;
  size: number;
  url: string;
  pathname: string;
}

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

const SAFE_NAME = /[^\w.\- ]+/g;

/**
 * Upload a file to Vercel Blob and, when editing an existing payment, record it
 * straight away. When creating (`paymentId` null) the blob is stored and its
 * details returned as a draft — the form stages it and `savePaymentAction`
 * writes the row after the payment exists.
 */
export async function uploadAttachmentAction(
  paymentId: string | null,
  form: FormData,
): Promise<
  | { ok: true; draft: AttachmentDraft; attachment: PaymentAttachment | null }
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
  // Scoped to the user so the streaming route can authorise by prefix alone.
  const blob = await put(
    `payments/${userId}/${crypto.randomUUID()}-${safeName}`,
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

  if (!paymentId) return { ok: true, draft, attachment: null };

  const attachment = await addAttachment(userId, { paymentId, ...draft });
  if (!attachment) {
    await del(blob.url).catch(() => undefined);
    return { ok: false, error: 'That payment no longer exists.' };
  }
  revalidatePath('/plan');
  return { ok: true, draft, attachment };
}

/** Remove an attachment — deletes the row and the underlying blob. */
export async function removeAttachmentAction(id: string): Promise<FormState> {
  const userId = await requireUserId();
  if (typeof id !== 'string' || !id) {
    return { ok: false, error: 'Bad attachment.' };
  }
  const row = await deleteAttachment(userId, id);
  if (row) await del(row.url).catch(() => undefined);
  revalidatePath('/plan');
  return { ok: true };
}

/**
 * Delete blobs that were uploaded but never saved — the form calls this when a
 * new-payment sheet is cancelled, or a staged file is removed before saving.
 */
export async function discardBlobsAction(
  urls: string[],
): Promise<{ ok: true }> {
  await requireUserId();
  const safe = (Array.isArray(urls) ? urls : [])
    .filter((u) => typeof u === 'string' && isBlobUrl(u))
    .slice(0, 20);
  if (safe.length > 0) await del(safe).catch(() => undefined);
  return { ok: true };
}
