import { and, eq } from 'drizzle-orm';
import { getDb } from '../client';
import {
  pushSubscriptions,
  type PushSubscriptionRow,
} from '../schema/push';

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

/** Every browser the user has opted into push on. */
export async function listPushSubscriptions(
  userId: string,
): Promise<PushSubscriptionRow[]> {
  return getDb()
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
}

/**
 * Register (or refresh) one browser's subscription. Keyed on `endpoint`, which
 * the push service guarantees unique — so re-subscribing the same browser, or
 * a key rotation that keeps the endpoint, updates in place.
 */
export async function savePushSubscription(
  userId: string,
  input: PushSubscriptionInput,
): Promise<void> {
  await getDb()
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
      },
    });
}

/** Drop one browser's subscription (user toggled push off, or it 404'd). */
export async function deletePushSubscription(
  endpoint: string,
  userId?: string,
): Promise<void> {
  await getDb()
    .delete(pushSubscriptions)
    .where(
      userId
        ? and(
            eq(pushSubscriptions.endpoint, endpoint),
            eq(pushSubscriptions.userId, userId),
          )
        : eq(pushSubscriptions.endpoint, endpoint),
    );
}
