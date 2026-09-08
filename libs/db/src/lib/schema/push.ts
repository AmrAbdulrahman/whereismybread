import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * A browser's Web Push subscription (one row per browser/device that opted
 * in). Generic on purpose — any notification source can fan out to these.
 *
 * `endpoint` is the push service URL and is globally unique, so re-subscribing
 * the same browser upserts on it. A `404`/`410` from the push service when
 * sending means the browser dropped the subscription — the sender deletes the
 * row rather than retrying it.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    /** Client public key (base64url) — the `p256dh` from `PushSubscription`. */
    p256dh: text('p256dh').notNull(),
    /** Client auth secret (base64url) — the `auth` from `PushSubscription`. */
    auth: text('auth').notNull(),
    /** For the "manage devices" list; best-effort. */
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;
