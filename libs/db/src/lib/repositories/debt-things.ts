import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../client';
import {
  debtEntries,
  debtLines,
  debtThings,
  type DebtThing,
} from '../schema/debts';

/** A user-defined denomination — name, logo, unit, per-unit reference value. */
export interface DebtThingInput {
  name: string;
  logoUrl: string | null;
  unit: string;
  valueMinor: number;
  valueCurrency: string;
}

export async function listDebtThings(userId: string): Promise<DebtThing[]> {
  return getDb()
    .select()
    .from(debtThings)
    .where(eq(debtThings.userId, userId))
    .orderBy(asc(debtThings.sortOrder), asc(debtThings.name));
}

export async function getDebtThing(
  userId: string,
  id: string,
): Promise<DebtThing | undefined> {
  const rows = await getDb()
    .select()
    .from(debtThings)
    .where(and(eq(debtThings.id, id), eq(debtThings.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function createDebtThing(
  userId: string,
  input: DebtThingInput,
): Promise<DebtThing> {
  const rows = await getDb()
    .insert(debtThings)
    .values({
      userId,
      name: input.name.trim(),
      logoUrl: input.logoUrl,
      unit: input.unit,
      valueMinor: input.valueMinor,
      valueCurrency: input.valueCurrency,
    })
    .returning();
  if (!rows[0]) throw new Error('createDebtThing: no row');
  return rows[0];
}

export async function updateDebtThing(
  userId: string,
  id: string,
  input: DebtThingInput,
): Promise<DebtThing | undefined> {
  const rows = await getDb()
    .update(debtThings)
    .set({
      name: input.name.trim(),
      logoUrl: input.logoUrl,
      unit: input.unit,
      valueMinor: input.valueMinor,
      valueCurrency: input.valueCurrency,
      updatedAt: new Date(),
    })
    .where(and(eq(debtThings.id, id), eq(debtThings.userId, userId)))
    .returning();
  return rows[0];
}

export async function deleteDebtThing(
  userId: string,
  id: string,
): Promise<void> {
  await getDb()
    .delete(debtThings)
    .where(and(eq(debtThings.id, id), eq(debtThings.userId, userId)));
}

/** `true` when at least one debt row / repayment references the thing. */
export async function thingInUse(userId: string, id: string): Promise<boolean> {
  const line = await getDb()
    .select({ id: debtLines.id })
    .from(debtLines)
    .where(and(eq(debtLines.thingId, id), eq(debtLines.userId, userId)))
    .limit(1);
  if (line.length > 0) return true;
  const entry = await getDb()
    .select({ id: debtEntries.id })
    .from(debtEntries)
    .where(and(eq(debtEntries.thingId, id), eq(debtEntries.userId, userId)))
    .limit(1);
  return entry.length > 0;
}

/** Per-thing use counts across the whole catalogue, keyed by thing id. */
export async function thingUseCounts(
  userId: string,
): Promise<Map<string, number>> {
  const notNull = (col: typeof debtLines.thingId | typeof debtEntries.thingId) =>
    sql`${col} is not null`;
  const lines = await getDb()
    .select({ id: debtLines.thingId, n: sql<number>`count(*)::int` })
    .from(debtLines)
    .where(and(eq(debtLines.userId, userId), notNull(debtLines.thingId)))
    .groupBy(debtLines.thingId);
  const entries = await getDb()
    .select({ id: debtEntries.thingId, n: sql<number>`count(*)::int` })
    .from(debtEntries)
    .where(and(eq(debtEntries.userId, userId), notNull(debtEntries.thingId)))
    .groupBy(debtEntries.thingId);
  const out = new Map<string, number>();
  for (const r of [...lines, ...entries]) {
    if (r.id) out.set(r.id, (out.get(r.id) ?? 0) + r.n);
  }
  return out;
}
