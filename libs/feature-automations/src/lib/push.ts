import 'server-only';

import webpush from 'web-push';
import { serverEnv } from '@wib/config';
import {
  deletePushSubscription,
  listPushSubscriptions,
  type NotificationInput,
  type PushSubscriptionRow,
} from '@wib/db';

let configured: boolean | undefined;

/** Wire up VAPID once. Returns false when push isn't configured for the env. */
function ensureConfigured(): boolean {
  if (configured !== undefined) return configured;
  const env = serverEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  configured = true;
  return true;
}

/** What the service worker's `push` handler expects. */
interface PushPayload {
  title: string;
  body: string;
  url: string;
  /** Coalescing key — byte-identical notices replace rather than stack. */
  tag: string;
}

/** Stable, collision-cheap key for one notice's visible content. */
function contentTag(title: string, body: string): string {
  let h = 5381;
  const s = `${title} ${body}`;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `wib-${(h >>> 0).toString(36)}`;
}

function toPayload(n: NotificationInput): string {
  const title = n.title.slice(0, 200);
  const body = (n.body ?? '').slice(0, 500);
  return JSON.stringify({
    title,
    body,
    url: n.href ?? '/notifications',
    tag: contentTag(title, body),
  } satisfies PushPayload);
}

async function sendOne(
  sub: PushSubscriptionRow,
  payload: string,
): Promise<void> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      payload,
    );
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'statusCode' in err
        ? Number((err as { statusCode: unknown }).statusCode)
        : 0;
    // 404 / 410 → the browser dropped this subscription; forget it.
    if (status === 404 || status === 410) {
      await deletePushSubscription(sub.endpoint).catch(() => undefined);
      return;
    }
    console.error('[push] send failed', status || err);
  }
}

/**
 * Fan a batch of notices out to every browser the user has opted into push on.
 * Best-effort: never throws, prunes dead subscriptions, and is a no-op when
 * push isn't configured or the user has none.
 */
export async function sendPushToUser(
  userId: string,
  notices: NotificationInput[],
): Promise<void> {
  if (notices.length === 0 || !ensureConfigured()) return;
  let subs: PushSubscriptionRow[];
  try {
    subs = await listPushSubscriptions(userId);
  } catch {
    return;
  }
  if (subs.length === 0) return;
  await Promise.all(
    subs.flatMap((sub) => notices.map((n) => sendOne(sub, toPayload(n)))),
  );
}
