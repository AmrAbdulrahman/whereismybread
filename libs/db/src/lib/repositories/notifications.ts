import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { notifications, type Notification } from '../schema/automations';

export interface NotificationInput {
  title: string;
  body?: string;
  href?: string | null;
  automationId?: string | null;
}

export async function createNotification(
  userId: string,
  input: NotificationInput,
): Promise<Notification> {
  const rows = await getDb()
    .insert(notifications)
    .values({
      userId,
      title: input.title.slice(0, 200),
      body: (input.body ?? '').slice(0, 2000),
      href: input.href ?? null,
      automationId: input.automationId ?? null,
    })
    .returning();
  if (!rows[0]) throw new Error('createNotification: no row');
  return rows[0];
}

export async function createNotifications(
  userId: string,
  inputs: NotificationInput[],
): Promise<number> {
  if (inputs.length === 0) return 0;
  const rows = await getDb()
    .insert(notifications)
    .values(
      inputs.map((n) => ({
        userId,
        title: n.title.slice(0, 200),
        body: (n.body ?? '').slice(0, 2000),
        href: n.href ?? null,
        automationId: n.automationId ?? null,
      })),
    )
    .returning({ id: notifications.id });
  return rows.length;
}

export async function listNotifications(
  userId: string,
  opts: { limit?: number } = {},
): Promise<Notification[]> {
  return getDb()
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(Math.min(opts.limit ?? 100, 200));
}

/** Opaque paging key — a batch insert gives rows an identical timestamp, so
 * the id is part of the cursor to keep the order total. */
export interface NotificationCursor {
  createdAt: string;
  id: string;
}

export interface NotificationsPage {
  items: Notification[];
  nextCursor: NotificationCursor | null;
}

/** One page of the user's notifications, newest first, for the bell's
 * infinite-scroll list. Pass the previous page's `nextCursor` to continue. */
export async function listNotificationsPage(
  userId: string,
  opts: { limit?: number; cursor?: NotificationCursor | null } = {},
): Promise<NotificationsPage> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const conds = [eq(notifications.userId, userId)];
  if (opts.cursor) {
    conds.push(
      sql`(${notifications.createdAt}, ${notifications.id}) < (${new Date(
        opts.cursor.createdAt,
      )}::timestamptz, ${opts.cursor.id}::uuid)`,
    );
  }
  const rows = await getDb()
    .select()
    .from(notifications)
    .where(and(...conds))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);

  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor =
    rows.length > limit && last
      ? { createdAt: new Date(last.createdAt).toISOString(), id: last.id }
      : null;
  return { items, nextCursor };
}

export async function countUnreadNotifications(
  userId: string,
): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );
  return rows[0]?.n ?? 0;
}

/** Mark specific notifications read, or all of the user's when `ids` is omitted. */
export async function markNotificationsRead(
  userId: string,
  ids?: string[],
): Promise<void> {
  const where =
    ids && ids.length > 0
      ? and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          sql`${notifications.id} = any(${ids})`,
        )
      : and(eq(notifications.userId, userId), isNull(notifications.readAt));
  await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(where);
}
