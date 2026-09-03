import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { accounts, payments, type Account } from '../schema/payments';

/** An account plus how many of the user's active payments point at it. */
export type AccountWithUsage = Account & { paymentCount: number };

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

export async function listAccountsWithUsage(
  userId: string,
): Promise<AccountWithUsage[]> {
  const rows = await getDb()
    .select({
      id: accounts.id,
      userId: accounts.userId,
      name: accounts.name,
      color: accounts.color,
      sortOrder: accounts.sortOrder,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
      paymentCount: sql<number>`count(${payments.id})`,
    })
    .from(accounts)
    .leftJoin(
      payments,
      and(
        eq(payments.accountId, accounts.id),
        sql`${payments.archivedAt} is null`,
      ),
    )
    .where(eq(accounts.userId, userId))
    .groupBy(accounts.id)
    .orderBy(asc(accounts.sortOrder), asc(sql`lower(${accounts.name})`));

  return rows.map((r) => ({ ...r, paymentCount: Number(r.paymentCount) }));
}

export async function getAccountByName(
  userId: string,
  name: string,
): Promise<Account | null> {
  const rows = await getDb()
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        sql`lower(${accounts.name}) = lower(${name.trim()})`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function updateAccount(
  userId: string,
  id: string,
  patch: Partial<{ name: string; color: string; sortOrder: number }>,
): Promise<Account | null> {
  if (patch.name != null) {
    const clash = await getDb()
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          sql`lower(${accounts.name}) = lower(${patch.name.trim()})`,
          sql`${accounts.id} <> ${id}`,
        ),
      )
      .limit(1);
    if (clash[0]) return null;
  }

  const rows = await getDb()
    .update(accounts)
    .set({
      ...patch,
      ...(patch.name != null ? { name: patch.name.trim() } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteAccount(userId: string, id: string): Promise<void> {
  await getDb()
    .delete(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
}
