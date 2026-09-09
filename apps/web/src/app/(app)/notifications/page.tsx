import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { NotificationsView } from '@wib/feature-automations';
import { getNotificationsData } from '@wib/feature-automations/server';

export const metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { notifications, unread } = await getNotificationsData(user.id);

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold">Notifications</h1>
          {unread > 0 ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-xs font-semibold text-ground">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </div>
        <p className="text-ink-soft">
          Notices from your automations and bank syncs. Opening this page marks
          them read.
        </p>
      </header>
      <NotificationsView notifications={notifications} />
    </div>
  );
}
