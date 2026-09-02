import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { banks, type Bank } from '../schema/payments';

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

export async function updateBank(
  userId: string,
  id: string,
  patch: Partial<{ name: string; color: string; sortOrder: number }>,
): Promise<void> {
  await getDb()
    .update(banks)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(banks.id, id), eq(banks.userId, userId)));
}

export async function deleteBank(userId: string, id: string): Promise<void> {
  await getDb()
    .delete(banks)
    .where(and(eq(banks.id, id), eq(banks.userId, userId)));
}
