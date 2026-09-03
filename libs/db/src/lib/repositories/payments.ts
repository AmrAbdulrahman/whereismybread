import {
  addDays,
  expandOccurrences,
  startOfMonth,
  type Recurrence,
} from '@wib/domain';
import { and, desc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import { getDb } from '../client';
import {
  accounts,
  banks,
  paymentEvents,
  paymentMethods,
  paymentTags,
  payments,
  tags,
  type Account,
  type Bank,
  type Payment,
  type PaymentLineItem,
  type PaymentMethod,
  type Tag,
} from '../schema/payments';

export interface PaymentWithMeta extends Payment {
  method: PaymentMethod | null;
  account: Account | null;
  bank: Bank | null;
  tags: Tag[];
}

export interface PaymentInput {
  name: string;
  amountKind: 'fixed' | 'per_unit' | 'group';
  /** Fixed: the charge. Per-unit: unit price. Group: snapshot of the record sum. */
  amountMinor: number;
  unitName: string | null;
  defaultUnits: number;
  /** The records a `group` payment's amount is derived from (else null). */
  lineItems: PaymentLineItem[] | null;
  feeKind: 'none' | 'fixed' | 'percent';
  feeFixedMinor: number;
  feePercent: number;
  currency: string;
  methodId: string | null;
  accountId: string | null;
  bankId: string | null;
  recipientMethodId: string | null;
  recurrence: Recurrence;
  anchorDate: string;
  dayOfMonth: number | null;
  endsOn: string | null;
  url: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  isSubscription: boolean;
  notes: string | null;
  tagIds: string[];
}

/** Method / account / bank lists a caller may already have loaded. */
export interface PaymentMetaLookups {
  methods: PaymentMethod[];
  accounts: Account[];
  banks: Bank[];
}

async function attachMeta(
  userId: string,
  rows: Payment[],
  lookups?: PaymentMetaLookups,
): Promise<PaymentWithMeta[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  // Reuse the caller's already-loaded lists when given — otherwise fetch them.
  // Sequential, not Promise.all: the Supabase transaction pooler does not
  // support pipelining concurrent queries on one connection — it hangs.
  const methodRows =
    lookups?.methods ??
    (await getDb()
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, userId)));
  const accountRows =
    lookups?.accounts ??
    (await getDb().select().from(accounts).where(eq(accounts.userId, userId)));
  const bankRows =
    lookups?.banks ??
    (await getDb().select().from(banks).where(eq(banks.userId, userId)));
  const methodById = new Map(methodRows.map((m) => [m.id, m]));
  const accountById = new Map(accountRows.map((a) => [a.id, a]));
  const bankById = new Map(bankRows.map((b) => [b.id, b]));

  const tagLinks = await getDb()
    .select({ paymentId: paymentTags.paymentId, tag: tags })
    .from(paymentTags)
    .innerJoin(tags, eq(tags.id, paymentTags.tagId))
    .where(inArray(paymentTags.paymentId, ids));
  const tagsByPayment = new Map<string, Tag[]>();
  for (const link of tagLinks) {
    const list = tagsByPayment.get(link.paymentId);
    if (list) list.push(link.tag);
    else tagsByPayment.set(link.paymentId, [link.tag]);
  }

  return rows.map((p) => ({
    ...p,
    method: p.methodId ? (methodById.get(p.methodId) ?? null) : null,
    account: p.accountId ? (accountById.get(p.accountId) ?? null) : null,
    bank: p.bankId ? (bankById.get(p.bankId) ?? null) : null,
    tags: tagsByPayment.get(p.id) ?? [],
  }));
}

export async function listPayments(userId: string): Promise<PaymentWithMeta[]> {
  const rows = await getDb()
    .select()
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.createdAt));
  return attachMeta(userId, rows);
}

export async function listActivePayments(
  userId: string,
  lookups?: PaymentMetaLookups,
): Promise<PaymentWithMeta[]> {
  const rows = await getDb()
    .select()
    .from(payments)
    .where(and(eq(payments.userId, userId), isNull(payments.archivedAt)));
  return attachMeta(userId, rows, lookups);
}

export async function getPayment(
  userId: string,
  id: string,
): Promise<PaymentWithMeta | null> {
  const rows = await getDb()
    .select()
    .from(payments)
    .where(and(eq(payments.id, id), eq(payments.userId, userId)))
    .limit(1);
  if (!rows[0]) return null;
  return (await attachMeta(userId, rows))[0] ?? null;
}

/**
 * The bare payment row, no method/account/bank/tag joins — for callers that
 * only need the payment's own columns (edit/delete flows compare fields and
 * read the recurrence spec). Saves three sequential lookups per call.
 */
export async function getPaymentRow(
  userId: string,
  id: string,
): Promise<Payment | null> {
  const rows = await getDb()
    .select()
    .from(payments)
    .where(and(eq(payments.id, id), eq(payments.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Column values shared by insert and update (everything but ownership/tags). */
const paymentColumns = (input: PaymentInput) => ({
  name: input.name,
  amountKind: input.amountKind,
  amountMinor: input.amountMinor,
  lineItems: input.lineItems,
  unitName: input.unitName,
  defaultUnits: input.defaultUnits,
  feeKind: input.feeKind,
  feeFixedMinor: input.feeFixedMinor,
  feePercent: input.feePercent,
  currency: input.currency,
  methodId: input.methodId,
  accountId: input.accountId,
  bankId: input.bankId,
  recipientMethodId: input.recipientMethodId,
  recurrence: input.recurrence,
  anchorDate: input.anchorDate,
  dayOfMonth: input.dayOfMonth,
  endsOn: input.endsOn,
  url: input.url,
  logoUrl: input.logoUrl,
  brandColor: input.brandColor,
  isSubscription: input.isSubscription,
  notes: input.notes,
});

const paymentValues = (userId: string, input: PaymentInput) => ({
  userId,
  ...paymentColumns(input),
});

export async function createPayment(
  userId: string,
  input: PaymentInput,
): Promise<Payment> {
  // No tags → a single insert, no transaction round trips.
  if (input.tagIds.length === 0) {
    const rows = await getDb()
      .insert(payments)
      .values(paymentValues(userId, input))
      .returning();
    if (!rows[0]) throw new Error('createPayment: no row');
    return rows[0];
  }

  return getDb().transaction(async (tx) => {
    const inserted = await tx
      .insert(payments)
      .values(paymentValues(userId, input))
      .returning();
    const payment = inserted[0];
    if (!payment) throw new Error('createPayment: no row');

    await tx
      .insert(paymentTags)
      .values(input.tagIds.map((tagId) => ({ paymentId: payment.id, tagId })))
      .onConflictDoNothing();
    return payment;
  });
}

export async function updatePayment(
  userId: string,
  id: string,
  input: PaymentInput,
): Promise<void> {
  await getDb().transaction(async (tx) => {
    const owned = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.id, id), eq(payments.userId, userId)))
      .limit(1);
    if (!owned[0]) throw new Error('updatePayment: not found');

    await tx
      .update(payments)
      .set({ ...paymentColumns(input), updatedAt: new Date() })
      .where(eq(payments.id, id));

    await tx.delete(paymentTags).where(eq(paymentTags.paymentId, id));
    if (input.tagIds.length > 0) {
      await tx
        .insert(paymentTags)
        .values(input.tagIds.map((tagId) => ({ paymentId: id, tagId })))
        .onConflictDoNothing();
    }
  });
}

export async function deletePayment(userId: string, id: string): Promise<void> {
  await getDb()
    .delete(payments)
    .where(and(eq(payments.id, id), eq(payments.userId, userId)));
}

/** Flag / unflag the whole series. `note` of `null` clears the flag. */
export async function setPaymentFlag(
  userId: string,
  id: string,
  note: string | null,
): Promise<void> {
  await getDb()
    .update(payments)
    .set({ flagNote: note, updatedAt: new Date() })
    .where(and(eq(payments.id, id), eq(payments.userId, userId)));
}

export interface DeletePaymentResult {
  /** True when the row was removed outright (no earlier month to preserve). */
  removed: boolean;
  /** Set when the recurrence was truncated instead — inclusive last date kept. */
  endedOn?: string;
}

/**
 * Remove a payment from `cutoff` (first day of the current month) onward while
 * leaving every earlier month untouched:
 *  - one-time in the past      → left as-is
 *  - one-time now / future     → deleted
 *  - recurring with past months → `endsOn` clamped to the day before `cutoff`,
 *                                 and any actuals dated `cutoff` or later dropped
 *  - recurring with no past months → deleted
 */
export async function deletePaymentFrom(
  userId: string,
  id: string,
  cutoff: string,
): Promise<DeletePaymentResult> {
  const rows = await getDb()
    .select()
    .from(payments)
    .where(and(eq(payments.id, id), eq(payments.userId, userId)))
    .limit(1);
  const p = rows[0];
  if (!p) throw new Error('deletePaymentFrom: not found');

  const lastKept = addDays(cutoff, -1);

  if (p.recurrence === 'one_time') {
    if (p.anchorDate >= cutoff) {
      await deletePayment(userId, id);
      return { removed: true };
    }
    return { removed: false };
  }

  const [firstOcc] = expandOccurrences(
    {
      recurrence: p.recurrence,
      anchorDate: p.anchorDate,
      dayOfMonth: p.dayOfMonth,
      endsOn: p.endsOn,
    },
    { from: startOfMonth(p.anchorDate), to: addDays(cutoff, 400) },
    { limit: 1 },
  );
  const hasPastOccurrence = firstOcc != null && firstOcc.dueDate < cutoff;

  const pastEvents = await getDb()
    .select({ id: paymentEvents.id })
    .from(paymentEvents)
    .where(
      and(
        eq(paymentEvents.userId, userId),
        eq(paymentEvents.paymentId, id),
        lt(paymentEvents.dueDate, cutoff),
      ),
    )
    .limit(1);

  if (!hasPastOccurrence && pastEvents.length === 0) {
    await deletePayment(userId, id);
    return { removed: true };
  }

  const endedOn = p.endsOn && p.endsOn < lastKept ? p.endsOn : lastKept;

  await getDb().transaction(async (tx) => {
    await tx
      .update(payments)
      .set({ endsOn: endedOn, updatedAt: new Date() })
      .where(eq(payments.id, id));
    await tx
      .delete(paymentEvents)
      .where(
        and(
          eq(paymentEvents.userId, userId),
          eq(paymentEvents.paymentId, id),
          gte(paymentEvents.dueDate, cutoff),
        ),
      );
  });

  return { removed: false, endedOn };
}

/**
 * Fork a recurring series at `occurrenceDate`: the original keeps every month
 * before it, a fresh payment carries `newInput` from that month forward. When
 * `occurrenceDate` is at/before the series start there is nothing to keep, so
 * this is just an in-place update.
 */
export async function splitPaymentForward(
  userId: string,
  id: string,
  occurrenceDate: string,
  newInput: PaymentInput,
): Promise<void> {
  const original = await getPaymentRow(userId, id);
  if (!original) throw new Error('splitPaymentForward: not found');

  if (
    original.recurrence === 'one_time' ||
    startOfMonth(occurrenceDate) <= startOfMonth(original.anchorDate)
  ) {
    await updatePayment(userId, id, newInput);
    return;
  }

  await deletePaymentFrom(userId, id, startOfMonth(occurrenceDate));
  await createPayment(userId, { ...newInput, anchorDate: occurrenceDate });
}
