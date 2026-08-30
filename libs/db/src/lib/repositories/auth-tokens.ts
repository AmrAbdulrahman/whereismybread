import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from '../client';
import { emailVerificationTokens, passwordResetTokens } from '../schema/users';

type TokenTable = typeof passwordResetTokens | typeof emailVerificationTokens;

async function insertToken(
  table: TokenTable,
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await getDb().insert(table).values({ userId, tokenHash, expiresAt });
}

async function findLiveToken(table: TokenTable, tokenHash: string) {
  const rows = await getDb()
    .select()
    .from(table)
    .where(
      and(
        eq(table.tokenHash, tokenHash),
        isNull(table.usedAt),
        gt(table.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0];
}

async function markUsed(table: TokenTable, id: string): Promise<void> {
  await getDb()
    .update(table)
    .set({ usedAt: new Date() })
    .where(eq(table.id, id));
}

async function deleteForUser(table: TokenTable, userId: string): Promise<void> {
  await getDb().delete(table).where(eq(table.userId, userId));
}

// --- password reset ---

export function createPasswordResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
) {
  return insertToken(passwordResetTokens, userId, tokenHash, expiresAt);
}

export function findLivePasswordResetToken(tokenHash: string) {
  return findLiveToken(passwordResetTokens, tokenHash);
}

export function markPasswordResetTokenUsed(id: string) {
  return markUsed(passwordResetTokens, id);
}

export function deleteUserPasswordResetTokens(userId: string) {
  return deleteForUser(passwordResetTokens, userId);
}

// --- email verification ---

export function createEmailVerificationToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
) {
  return insertToken(emailVerificationTokens, userId, tokenHash, expiresAt);
}

export function findLiveEmailVerificationToken(tokenHash: string) {
  return findLiveToken(emailVerificationTokens, tokenHash);
}

export function markEmailVerificationTokenUsed(id: string) {
  return markUsed(emailVerificationTokens, id);
}

export function deleteUserEmailVerificationTokens(userId: string) {
  return deleteForUser(emailVerificationTokens, userId);
}
