'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Notification } from '@wib/db';
import { cn } from '@wib/ui';
import { markNotificationsReadAction } from '../lib/actions';

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

export function NotificationsView({
  notifications,
}: {
  notifications: Notification[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Which notifications were still unread when the page was opened — frozen on
  // first render so their highlight survives the refresh that follows
  // auto-marking everything read.
  const [openedUnread] = useState(
    () => new Set(notifications.filter((n) => !n.readAt).map((n) => n.id)),
  );
  const marked = useRef(false);

  // Opening the page is the "read" — clear the unread state (and the nav badge)
  // as soon as it mounts.
  useEffect(() => {
    if (marked.current || openedUnread.size === 0) return;
    marked.current = true;
    startTransition(async () => {
      await markNotificationsReadAction();
      router.refresh();
    });
  }, [openedUnread, router]);

  if (notifications.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong px-4 py-10 text-center">
        <p className="text-sm font-medium text-ink">Nothing here yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
          Automations with a “Send notification” action, and bank syncs, leave a
          note here.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {notifications.map((n) => {
        const wasUnread = openedUnread.has(n.id);
        const body = (
          <div
            className={cn(
              'rounded-xl border p-3',
              wasUnread
                ? 'border-accent/40 bg-accent/5'
                : 'border-line bg-surface',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">{n.title}</p>
              <span className="shrink-0 text-[11px] text-muted">
                {timeAgo(n.createdAt as unknown as string)}
              </span>
            </div>
            {n.body ? (
              <p className="mt-0.5 text-xs text-ink-soft">{n.body}</p>
            ) : null}
          </div>
        );
        return (
          <li key={n.id}>
            {n.href ? (
              <Link href={n.href} className="block">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
