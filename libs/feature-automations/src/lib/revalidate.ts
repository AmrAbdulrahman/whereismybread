import { updateTag } from 'next/cache';

/**
 * Bust the per-user page-bundle data cache. Mirrors
 * `@wib/feature-payments`'s `revalidateUserData` / `userDataTag` — the tag
 * string is a cross-lib contract (`user-data:<id>`), kept in sync by hand
 * because a feature lib can't depend on feature-payments' internals here.
 * Call after an automation mutates a payment / expense / review item so a
 * later `/plan` or `/insights` render doesn't serve stale data.
 */
export function revalidateUserData(userId: string): void {
  updateTag(`user-data:${userId}`);
}
