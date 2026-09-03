import { and, between, eq, isNull } from 'drizzle-orm';
import { getDb } from '../client';
import {
  paymentEvents,
  type PaymentEvent,
  type PaymentOverrides,
} from '../schema/payments';

export type { PaymentOverrides };

export async function listPaymentEvents(
  userId: string,
  window: { from: string; to: string },
): Promise<PaymentEvent[]> {
  return getDb()
    .select()
    .from(paymentEvents)
    .where(
      and(
        eq(paymentEvents.userId, userId),
        between(paymentEvents.dueDate, window.from, window.to),
      ),
    );
}

/** Mark one occurrence paid (or skipped). Keeps any override on the row. */
export async function markOccurrence(
  userId: string,
  input: {
    paymentId: string;
    dueDate: string;
    status: 'paid' | 'skipped';
  },
): Promise<void> {
  const paidAt = input.status === 'paid' ? new Date() : null;
  await getDb()
    .insert(paymentEvents)
    .values({
      userId,
      paymentId: input.paymentId,
      dueDate: input.dueDate,
      status: input.status,
      paidAt,
    })
    .onConflictDoUpdate({
      target: [paymentEvents.paymentId, paymentEvents.dueDate],
      set: { status: input.status, paidAt },
    });
}

/**
 * Store a per-month override for one occurrence (amount, method, notes…).
 * An empty override object clears it. Paid/skipped status is left untouched.
 */
export async function setOccurrenceOverride(
  userId: string,
  input: { paymentId: string; dueDate: string; overrides: PaymentOverrides },
): Promise<void> {
  const overrides =
    Object.keys(input.overrides).length > 0 ? input.overrides : null;

  if (overrides == null) {
    // Nothing to override — drop the row unless it also records paid/skipped.
    await getDb()
      .delete(paymentEvents)
      .where(
        and(
          eq(paymentEvents.userId, userId),
          eq(paymentEvents.paymentId, input.paymentId),
          eq(paymentEvents.dueDate, input.dueDate),
          isNull(paymentEvents.status),
        ),
      );
    await getDb()
      .update(paymentEvents)
      .set({ overrides: null })
      .where(
        and(
          eq(paymentEvents.userId, userId),
          eq(paymentEvents.paymentId, input.paymentId),
          eq(paymentEvents.dueDate, input.dueDate),
        ),
      );
    return;
  }

  await getDb()
    .insert(paymentEvents)
    .values({
      userId,
      paymentId: input.paymentId,
      dueDate: input.dueDate,
      status: null,
      overrides,
    })
    .onConflictDoUpdate({
      target: [paymentEvents.paymentId, paymentEvents.dueDate],
      set: { overrides },
    });
}

/**
 * Merge a partial override onto whatever one occurrence already has, so a
 * single-field tweak (e.g. units) doesn't wipe the rest. `undefined` values in
 * the patch are ignored; `null` is kept (explicit "clear this field").
 */
export async function mergeOccurrenceOverride(
  userId: string,
  input: {
    paymentId: string;
    dueDate: string;
    patch: Partial<PaymentOverrides>;
  },
): Promise<void> {
  const rows = await getDb()
    .select({ overrides: paymentEvents.overrides })
    .from(paymentEvents)
    .where(
      and(
        eq(paymentEvents.userId, userId),
        eq(paymentEvents.paymentId, input.paymentId),
        eq(paymentEvents.dueDate, input.dueDate),
      ),
    )
    .limit(1);

  const merged: PaymentOverrides = { ...(rows[0]?.overrides ?? {}) };
  for (const [k, v] of Object.entries(input.patch)) {
    if (v !== undefined) (merged as Record<string, unknown>)[k] = v;
  }
  await setOccurrenceOverride(userId, {
    paymentId: input.paymentId,
    dueDate: input.dueDate,
    overrides: merged,
  });
}

/**
 * Flag / unflag a single occurrence with a note. An empty / `null` note clears
 * the flag, and drops the row if it carries nothing else (no status, override).
 */
export async function setOccurrenceFlag(
  userId: string,
  input: { paymentId: string; dueDate: string; note: string | null },
): Promise<void> {
  const note = input.note?.trim() ? input.note.trim() : null;
  const match = and(
    eq(paymentEvents.userId, userId),
    eq(paymentEvents.paymentId, input.paymentId),
    eq(paymentEvents.dueDate, input.dueDate),
  );

  if (note == null) {
    await getDb().update(paymentEvents).set({ flagNote: null }).where(match);
    await getDb()
      .delete(paymentEvents)
      .where(
        and(
          match,
          isNull(paymentEvents.status),
          isNull(paymentEvents.overrides),
          isNull(paymentEvents.flagNote),
        ),
      );
    return;
  }

  await getDb()
    .insert(paymentEvents)
    .values({
      userId,
      paymentId: input.paymentId,
      dueDate: input.dueDate,
      status: null,
      flagNote: note,
    })
    .onConflictDoUpdate({
      target: [paymentEvents.paymentId, paymentEvents.dueDate],
      set: { flagNote: note },
    });
}

/** Forget everything the user did to one occurrence — status and override. */
export async function clearOccurrence(
  userId: string,
  paymentId: string,
  dueDate: string,
): Promise<void> {
  await getDb()
    .delete(paymentEvents)
    .where(
      and(
        eq(paymentEvents.userId, userId),
        eq(paymentEvents.paymentId, paymentId),
        eq(paymentEvents.dueDate, dueDate),
      ),
    );
}
