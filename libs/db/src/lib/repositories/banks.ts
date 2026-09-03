import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { banks, payments, type Bank } from '../schema/payments';

/** A bank plus how many of the user's active payments point at it. */
export type BankWithUsage = Bank & { paymentCount: number };

const BANK_PALETTE = [
  '#6321d6',
  '#0e8074',
  '#a8641a',
  '#a83f77',
  '#4f7a34',
  '#2d6a9f',
] as const;

export async function listBanks(userId: string): Promise<Bank[]> {
  return getDb()
    .select()
    .from(banks)
    .where(eq(banks.userId, userId))
    .orderBy(asc(banks.sortOrder), asc(sql`lower(${banks.name})`));
}

export async function createBank(
  userId: string,
  input: { name: string; color?: string },
): Promise<Bank> {
  const color =
    input.color ??
    BANK_PALETTE[Math.floor(Math.random() * BANK_PALETTE.length)] ??
    BANK_PALETTE[0];

  const rows = await getDb()
    .insert(banks)
    .values({ userId, name: input.name.trim(), color })
    .onConflictDoNothing()
    .returning();
  if (rows[0]) return rows[0];

  const found = await getDb()
    .select()
    .from(banks)
    .where(
      and(
        eq(banks.userId, userId),
        sql`lower(${banks.name}) = lower(${input.name.trim()})`,
      ),
    )
    .limit(1);
  if (!found[0]) throw new Error('createBank: conflict but no existing row');
  return found[0];
}

export async function listBanksWithUsage(
  userId: string,
): Promise<BankWithUsage[]> {
  const rows = await getDb()
    .select({
      id: banks.id,
      userId: banks.userId,
      name: banks.name,
      color: banks.color,
      sortOrder: banks.sortOrder,
      createdAt: banks.createdAt,
      updatedAt: banks.updatedAt,
      paymentCount: sql<number>`count(${payments.id})`,
    })
    .from(banks)
    .leftJoin(
      payments,
      and(eq(payments.bankId, banks.id), sql`${payments.archivedAt} is null`),
    )
    .where(eq(banks.userId, userId))
    .groupBy(banks.id)
    .orderBy(asc(banks.sortOrder), asc(sql`lower(${banks.name})`));

  return rows.map((r) => ({ ...r, paymentCount: Number(r.paymentCount) }));
}

export async function getBankByName(
  userId: string,
  name: string,
): Promise<Bank | null> {
  const rows = await getDb()
    .select()
    .from(banks)
    .where(
      and(
        eq(banks.userId, userId),
        sql`lower(${banks.name}) = lower(${name.trim()})`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function updateBank(
  userId: string,
  id: string,
  patch: Partial<{ name: string; color: string; sortOrder: number }>,
): Promise<Bank | null> {
  if (patch.name != null) {
    const clash = await getDb()
      .select({ id: banks.id })
      .from(banks)
      .where(
        and(
          eq(banks.userId, userId),
          sql`lower(${banks.name}) = lower(${patch.name.trim()})`,
          sql`${banks.id} <> ${id}`,
        ),
      )
      .limit(1);
    if (clash[0]) return null;
  }

  const rows = await getDb()
    .update(banks)
    .set({
      ...patch,
      ...(patch.name != null ? { name: patch.name.trim() } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(banks.id, id), eq(banks.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteBank(userId: string, id: string): Promise<void> {
  await getDb()
    .delete(banks)
    .where(and(eq(banks.id, id), eq(banks.userId, userId)));
}
