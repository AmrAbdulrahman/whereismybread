'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { icons, usePushRefresh } from '@wib/ui';
import { NotificationsModal } from './notifications-modal';

/**
 * The sticky top-right notifications control: a bell with an unread count that
 * opens the notifications modal. `unread` comes from the app layout and is
 * re-fetched (via `router.refresh`) after the modal marks everything read, and
 * whenever a push tells the tab something arrived.
 */
export function NotificationsBell({
  unread,
  vapidPublicKey,
}: {
  unread: number;
  vapidPublicKey: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const Bell = icons.notifications;

  usePushRefresh(() => router.refresh());

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
        }
        aria-haspopup="dialog"
        className="fixed right-3 top-3 z-40 grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink shadow-sm transition-colors hover:border-accent hover:text-accent sm:right-4 sm:top-4 lg:right-[5.25rem] lg:top-[1.375rem]"
      >
        <Bell size={17} strokeWidth={2} />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-ground">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>
      <NotificationsModal
        open={open}
        onOpenChange={setOpen}
        vapidPublicKey={vapidPublicKey}
      />
    </>
  );
}
