import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { AppNav } from './_nav';
import { TimezoneCookie } from './_timezone-cookie';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <AppNav userName={user.name} userEmail={user.email}>
      <TimezoneCookie auto={user.timezoneAuto} />
      {children}
    </AppNav>
  );
}
