import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { users, type NewUser, type User } from '../schema/users';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(
  email: string,
): Promise<User | undefined> {
  const rows = await getDb()
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return rows[0];
}

export async function findUserById(id: string): Promise<User | undefined> {
  const rows = await getDb()
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return rows[0];
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  name: string;
  timezone?: string | null;
}): Promise<User> {
  const values: NewUser = {
    email: normalizeEmail(input.email),
    passwordHash: input.passwordHash,
    name: input.name.trim(),
    ...(input.timezone ? { timezone: input.timezone } : {}),
  };
  const rows = await getDb().insert(users).values(values).returning();
  const user = rows[0];
  if (!user) throw new Error('createUser: insert returned no row');
  return user;
}

export async function updateUserProfile(
  id: string,
  patch: { name: string },
): Promise<User> {
  const rows = await getDb()
    .update(users)
    .set({ name: patch.name.trim(), updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  const user = rows[0];
  if (!user) throw new Error('updateUserProfile: no such user');
  return user;
}

export async function updateUserPreferences(
  id: string,
  patch: Partial<{
    timezone: string | null;
    defaultCurrency: string;
    displayCurrency: string;
    incomeMode: string;
    incomeCurrency: string;
    incomeMinor: number;
    hourlyRateMinor: number;
    monthlyHours: number;
  }>,
): Promise<void> {
  await getDb()
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, id));
}

export async function updateUserPassword(
  id: string,
  passwordHash: string,
): Promise<void> {
  const now = new Date();
  await getDb()
    .update(users)
    .set({ passwordHash, passwordChangedAt: now, updatedAt: now })
    .where(eq(users.id, id));
}

export async function markEmailVerified(id: string): Promise<void> {
  const now = new Date();
  await getDb()
    .update(users)
    .set({ emailVerifiedAt: now, updatedAt: now })
    .where(eq(users.id, id));
}
