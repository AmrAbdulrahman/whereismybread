import { updateTag } from 'next/cache';
import { userDataTag } from './queries';

/**
 * Bust the per-user page-bundle cache (`loadBundle` in `queries.ts`). Call this
 * from every mutation that changes anything a `/plan` or `/insights` render
 * reads — payments, events, budgets, expenses, incomes, tags, bank sync, and
 * the currency/timezone/income preferences. Pairs with the existing
 * `revalidatePath('/plan')` calls: `revalidatePath` clears the route/Router
 * cache, this clears the data cache the bundle lives in.
 *
 * Uses `updateTag` (Next 16) for immediate, read-your-own-writes expiration —
 * every caller here is a Server Action.
 */
export function revalidateUserData(userId: string): void {
  updateTag(userDataTag(userId));
}
