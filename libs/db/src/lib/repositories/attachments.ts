import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../client';
import {
  paymentAttachments,
  payments,
  type PaymentAttachment,
} from '../schema/payments';

export interface AttachmentInput {
  paymentId: string;
  name: string;
  contentType: string;
  size: number;
  url: string;
  pathname: string;
}

/** Every attachment for a set of payments, oldest first. */
export async function listAttachments(
  userId: string,
  paymentIds: string[],
): Promise<PaymentAttachment[]> {
  if (paymentIds.length === 0) return [];
  return getDb()
    .select()
    .from(paymentAttachments)
    .where(
      and(
        eq(paymentAttachments.userId, userId),
        inArray(paymentAttachments.paymentId, paymentIds),
      ),
    )
    .orderBy(paymentAttachments.createdAt);
}

/** Insert an attachment row — the caller has already uploaded the blob. */
export async function addAttachment(
  userId: string,
  input: AttachmentInput,
): Promise<PaymentAttachment | null> {
  // Guard: the payment must belong to the user.
  const owned = await getDb()
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.id, input.paymentId), eq(payments.userId, userId)))
    .limit(1);
  if (!owned[0]) return null;

  const rows = await getDb()
    .insert(paymentAttachments)
    .values({ userId, ...input })
    .returning();
  return rows[0] ?? null;
}

/** Delete one attachment row, returning it so the caller can remove the blob. */
export async function deleteAttachment(
  userId: string,
  id: string,
): Promise<PaymentAttachment | null> {
  const rows = await getDb()
    .delete(paymentAttachments)
    .where(
      and(eq(paymentAttachments.id, id), eq(paymentAttachments.userId, userId)),
    )
    .returning();
  return rows[0] ?? null;
}

/**
 * Make a payment's attachments match `desired` (keyed by `pathname`): insert
 * the new ones, delete the rest. Returns the rows that were removed so the
 * caller can delete their blobs.
 */
export async function reconcileAttachments(
  userId: string,
  paymentId: string,
  desired: Omit<AttachmentInput, 'paymentId'>[],
): Promise<{ removed: PaymentAttachment[] }> {
  const existing = await getDb()
    .select()
    .from(paymentAttachments)
    .where(
      and(
        eq(paymentAttachments.userId, userId),
        eq(paymentAttachments.paymentId, paymentId),
      ),
    );

  const keep = new Set(desired.map((d) => d.pathname));
  const have = new Set(existing.map((e) => e.pathname));

  const toRemove = existing.filter((e) => !keep.has(e.pathname));
  const toAdd = desired.filter((d) => !have.has(d.pathname));

  if (toRemove.length > 0) {
    await getDb()
      .delete(paymentAttachments)
      .where(
        inArray(
          paymentAttachments.id,
          toRemove.map((r) => r.id),
        ),
      );
  }
  if (toAdd.length > 0) {
    await getDb()
      .insert(paymentAttachments)
      .values(toAdd.map((d) => ({ userId, paymentId, ...d })));
  }

  return { removed: toRemove };
}
