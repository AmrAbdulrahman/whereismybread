import type { PaymentMethodKind } from '@wib/domain';
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { paymentMethods, type PaymentMethod } from '../schema/payments';

const DEFAULT_METHODS: {
  name: string;
  kind: PaymentMethodKind;
  iconKey: string;
  color: string;
}[] = [
  {
    name: 'Direct debit',
    kind: 'direct_debit',
    iconKey: 'repeat',
    color: '#6321d6',
  },
  {
    name: 'Card',
    kind: 'credit_card',
    iconKey: 'card',
    color: '#0e8074',
  },
  { name: 'Cash', kind: 'cash', iconKey: 'cash', color: '#4f7a34' },
  {
    name: 'Manual transfer',
    kind: 'manual_transfer',
    iconKey: 'transfer',
    color: '#a8641a',
  },
];

export async function listPaymentMethods(
  userId: string,
): Promise<PaymentMethod[]> {
  return getDb()
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.userId, userId))
    .orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.name));
}

/** Seed the four standard methods the first time a user needs them. */
export async function ensureDefaultMethods(
  userId: string,
): Promise<PaymentMethod[]> {
  const existing = await listPaymentMethods(userId);
  if (existing.length > 0) return existing;

  await getDb()
    .insert(paymentMethods)
    .values(DEFAULT_METHODS.map((m, i) => ({ ...m, userId, sortOrder: i })))
    .onConflictDoNothing();

  return listPaymentMethods(userId);
}

export async function createPaymentMethod(
  userId: string,
  input: {
    name: string;
    kind: PaymentMethodKind;
    iconKey: string;
    logoUrl?: string | null;
    color: string;
    reference?: string | null;
  },
): Promise<PaymentMethod> {
  const rows = await getDb()
    .insert(paymentMethods)
    .values({
      ...input,
      userId,
      logoUrl: input.logoUrl ?? null,
      reference: input.reference ?? null,
    })
    .returning();
  if (!rows[0]) throw new Error('createPaymentMethod: no row');
  return rows[0];
}

export async function updatePaymentMethod(
  userId: string,
  id: string,
  patch: Partial<{
    name: string;
    iconKey: string;
    logoUrl: string | null;
    color: string;
    reference: string | null;
  }>,
): Promise<void> {
  await getDb()
    .update(paymentMethods)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, userId)));
}

export async function deletePaymentMethod(
  userId: string,
  id: string,
): Promise<void> {
  await getDb()
    .delete(paymentMethods)
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, userId)));
}
