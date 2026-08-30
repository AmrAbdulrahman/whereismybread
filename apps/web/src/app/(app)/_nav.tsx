'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell, icons, type NavItem } from '@wmm/ui';

const NAV_ITEMS: NavItem[] = [
  { href: '/calendar', label: 'Calendar', icon: icons.calendar },
  { href: '/subscriptions', label: 'Subscriptions', icon: icons.subscriptions },
  { href: '/installments', label: 'Installments', icon: icons.installments },
  { href: '/checklist', label: 'Checklist', icon: icons.checklist },
  { href: '/debts', label: 'Debts', icon: icons.debts },
  { href: '/tags', label: 'Tags', icon: icons.tags },
  { href: '/methods', label: 'Methods', icon: icons.methods },
  { href: '/settings', label: 'Settings', icon: icons.settings },
];

export function AppNav({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AppShell navItems={NAV_ITEMS} currentPath={pathname} linkComponent={Link}>
      {children}
    </AppShell>
  );
}
