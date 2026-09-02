import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { accounts, type Account } from '../schema/payments';

const ACCOUNT_PALETTE = [
  '#6321d6',
  '#0e8074',
  '#a8641a',
  '#a83f77',
  '#4f7a34',
  '#2d6a9f',
] as const;

export async function listAccounts(userId: string): Promise<Account[]> {
  return getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(asc(accounts.sortOrder), asc(sql`lower(${accounts.name})`));
}

export async function createAccount(
  userId: string,
  input: { name: string; color?: string },
): Promise<Account> {
  const color =
    input.color ??
    ACCOUNT_PALETTE[Math.floor(Math.random() * ACCOUNT_PALETTE.length)] ??
    ACCOUNT_PALETTE[0];

  const rows = await getDb()
    .insert(accounts)
    .values({ userId, name: input.name.trim(), color })
    .onConflictDoNothing()
    .returning();
  if (rows[0]) return rows[0];

  // Name already taken (case-insensitive) — return the existing row.
  const found = await getDb()
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        sql`lower(${accounts.name}) = lower(${input.name.trim()})`,
      ),
    )
    .limit(1);
  if (!found[0]) throw new Error('createAccount: conflict but no existing row');
  return found[0];
}

export async function updateAccount(
  userId: string,
  id: string,
  patch: Partial<{ name: string; color: string; sortOrder: number }>,
): Promise<void> {
  await getDb()
    .update(accounts)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
}

export async function deleteAccount(userId: string, id: string): Promise<void> {
  await getDb()
    .delete(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
}
