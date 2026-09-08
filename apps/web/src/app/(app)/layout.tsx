import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { getUnreadNotificationCount } from '@wib/feature-automations/server';
import { AppNav } from './_nav';
import { TimezoneCookie } from './_timezone-cookie';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const unreadNotifications = await getUnreadNotificationCount(user.id).catch(
    () => 0,
  );

  return (
    <AppNav
      userName={user.name}
      userEmail={user.email}
      unreadNotifications={unreadNotifications}
    >
      <TimezoneCookie auto={user.timezoneAuto} />
      {children}
    </AppNav>
  );
}
