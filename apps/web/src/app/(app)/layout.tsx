import type { ReactNode } from 'react';
import { AppNav } from './_nav';

// TODO(phase-1): guard this route group.
//   const user = await getCurrentUser();
//   if (!user) redirect('/login');

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppNav>{children}</AppNav>;
}
