import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { NotificationsView } from '@wib/feature-automations';
import { getNotificationsData } from '@wib/feature-automations/server';

export const metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { notifications } = await getNotificationsData(user.id);

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-ink-soft">
          Notices left by your automations. Also sent to your email.
        </p>
      </header>
      <NotificationsView notifications={notifications} />
    </div>
  );
}
