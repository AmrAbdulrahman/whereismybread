import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { recipientMethods, type RecipientMethod } from '../schema/payments';

const PALETTE = [
  '#6321d6',
  '#0e8074',
  '#a8641a',
  '#a83f77',
  '#4f7a34',
  '#2d6a9f',
] as const;

export async function listRecipientMethods(
  userId: string,
): Promise<RecipientMethod[]> {
  return getDb()
    .select()
    .from(recipientMethods)
    .where(eq(recipientMethods.userId, userId))
    .orderBy(
      asc(recipientMethods.sortOrder),
      asc(sql`lower(${recipientMethods.name})`),
    );
}

export async function createRecipientMethod(
  userId: string,
  input: {
    name: string;
    iconKey?: string;
    logoUrl?: string | null;
    color?: string;
  },
): Promise<RecipientMethod> {
  const color =
    input.color ??
    PALETTE[Math.floor(Math.random() * PALETTE.length)] ??
    PALETTE[0];
  const iconKey = input.iconKey ?? 'transfer';

  const rows = await getDb()
    .insert(recipientMethods)
    .values({
      userId,
      name: input.name.trim(),
      iconKey,
      logoUrl: input.logoUrl ?? null,
      color,
    })
    .onConflictDoNothing()
    .returning();
  if (rows[0]) return rows[0];

  // Name already taken (case-insensitive) — return the existing row.
  const found = await getDb()
    .select()
    .from(recipientMethods)
    .where(
      and(
        eq(recipientMethods.userId, userId),
        sql`lower(${recipientMethods.name}) = lower(${input.name.trim()})`,
      ),
    )
    .limit(1);
  if (!found[0]) {
    throw new Error('createRecipientMethod: conflict but no existing row');
  }
  return found[0];
}

export async function updateRecipientMethod(
  userId: string,
  id: string,
  patch: Partial<{
    name: string;
    iconKey: string;
    logoUrl: string | null;
    color: string;
    sortOrder: number;
  }>,
): Promise<void> {
  await getDb()
    .update(recipientMethods)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(recipientMethods.id, id), eq(recipientMethods.userId, userId)),
    );
}

export async function deleteRecipientMethod(
  userId: string,
  id: string,
): Promise<void> {
  await getDb()
    .delete(recipientMethods)
    .where(
      and(eq(recipientMethods.id, id), eq(recipientMethods.userId, userId)),
    );
}
