'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Notification } from '@wib/db';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Sheet,
  SheetContent,
  Spinner,
  cn,
  icons,
  useMediaQuery,
} from '@wib/ui';
import {
  loadNotificationsAction,
  markNotificationsReadAction,
  type NotificationsPageResult,
} from '../lib/actions';
import { PushNudge } from './push-nudge';

type Cursor = { createdAt: string; id: string };

function timeAgo(value: string | Date): string {
  const then = new Date(value).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

export function NotificationsModal({
  open,
  onOpenChange,
  vapidPublicKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vapidPublicKey: string;
}) {
  const router = useRouter();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const CloseIcon = icons.close;

  const [items, setItems] = useState<Notification[]>([]);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  // Frozen on first open so the "new" highlight survives marking them read.
  const openedUnread = useRef(new Set<string>());
  const startedRef = useRef(false);
  const markedRef = useRef(false);

  const absorb = useCallback((res: NotificationsPageResult) => {
    setItems((prev) => {
      const seen = new Set(prev.map((n) => n.id));
      return [...prev, ...res.items.filter((n) => !seen.has(n.id))];
    });
    if (res.nextCursor) setCursor(res.nextCursor);
    else setDone(true);
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    try {
      absorb(await loadNotificationsAction(cursor));
    } catch {
      setDone(true); // stop hammering the sentinel on failure
    } finally {
      setLoading(false);
    }
  }, [absorb, cursor, done, loading]);

  // First open: page 1, freeze unread ids, mark everything read.
  useEffect(() => {
    if (!open || startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      setLoading(true);
      try {
        const res = await loadNotificationsAction(null);
        for (const n of res.items) if (!n.readAt) openedUnread.current.add(n.id);
        setItems(res.items);
        if (res.nextCursor) setCursor(res.nextCursor);
        else setDone(true);
      } catch {
        setDone(true);
      } finally {
        setLoading(false);
      }
      if (!markedRef.current) {
        markedRef.current = true;
        await markNotificationsReadAction().catch(() => undefined);
        router.refresh(); // clears the bell badge
      }
    })();
  }, [open, router]);

  // Infinite scroll — observe a sentinel within the scroll container.
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = scrollRef.current;
    const el = sentinelRef.current;
    if (!open || !root || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { root, rootMargin: '160px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [open, loadMore]);

  const openItem = (n: Notification) => {
    onOpenChange(false);
    if (n.href) router.push(n.href);
  };

  const inner = (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <DialogTitle className="font-display text-base font-semibold text-ink">
          Notifications
        </DialogTitle>
        <button
          type="button"
          aria-label="Close"
          onClick={() => onOpenChange(false)}
          className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-3"
      >
        <PushNudge
          vapidPublicKey={vapidPublicKey}
          relevant={items.length > 0}
        />

        {items.length === 0 && !loading ? (
          <div className="rounded-xl border border-dashed border-line-strong px-4 py-10 text-center">
            <p className="text-sm font-medium text-ink">Nothing here yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
              Automations with a “Send notification” action, and bank syncs,
              leave a note here.
            </p>
          </div>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {items.map((n) => {
              const wasUnread = openedUnread.current.has(n.id);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn(
                      'block w-full rounded-xl border p-3 text-left transition-colors',
                      wasUnread
                        ? 'border-accent/40 bg-accent/5 hover:bg-accent/10'
                        : 'border-line bg-surface hover:bg-surface-2',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-ink">
                        {n.title}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted">
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                    {n.body ? (
                      <p className="mt-0.5 text-xs text-ink-soft">{n.body}</p>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div ref={sentinelRef} className="h-px" />
        {loading ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : null}
        {done && items.length > 0 ? (
          <p className="py-4 text-center text-[11px] text-muted">
            That’s everything
          </p>
        ) : null}
      </div>
    </>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          aria-describedby={undefined}
          className="flex max-h-[min(85dvh,calc(100dvh-2rem))] w-[min(30rem,calc(100vw-2rem))] flex-col overflow-hidden p-0"
        >
          {inner}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="flex max-h-[85dvh] flex-col overflow-hidden p-0 pb-[env(safe-area-inset-bottom)]"
      >
        {inner}
      </SheetContent>
    </Sheet>
  );
}
