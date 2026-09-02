import { and, between, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { monthIncomes, type MonthIncome } from '../schema/users';

/** Per-month income overrides that fall in `[from, to]` (YYYY-MM strings). */
export async function listMonthIncomes(
  userId: string,
  window: { from: string; to: string },
): Promise<MonthIncome[]> {
  return getDb()
    .select()
    .from(monthIncomes)
    .where(
      and(
        eq(monthIncomes.userId, userId),
        between(monthIncomes.month, window.from, window.to),
      ),
    );
}

/**
 * Override one month's income. Pass an explicit `amountMinor` (fixed mode) or
 * the `hours` worked (hourly mode) — whichever is given wins and the other is
 * cleared.
 */
export async function setMonthIncome(
  userId: string,
  month: string,
  input: {
    amountMinor?: number | null;
    currency?: string | null;
    hours?: number | null;
  },
): Promise<void> {
  const row = {
    amountMinor: input.amountMinor ?? null,
    currency: input.amountMinor != null ? (input.currency ?? null) : null,
    hours: input.hours ?? null,
  };
  await getDb()
    .insert(monthIncomes)
    .values({ userId, month, ...row })
    .onConflictDoUpdate({
      target: [monthIncomes.userId, monthIncomes.month],
      set: { ...row, updatedAt: new Date() },
    });
}

/** Drop one month's override — it falls back to the global income. */
export async function clearMonthIncome(
  userId: string,
  month: string,
): Promise<void> {
  await getDb()
    .delete(monthIncomes)
    .where(
      and(eq(monthIncomes.userId, userId), eq(monthIncomes.month, month)),
    );
}
