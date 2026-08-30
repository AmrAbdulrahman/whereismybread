'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell, icons, type NavItem } from '@wib/ui';
import { UserMenu } from './_user-menu';

const NAV_ITEMS: NavItem[] = [
  { href: '/calendar', label: 'Calendar', icon: icons.calendar },
  { href: '/subscriptions', label: 'Subscriptions', icon: icons.subscriptions },
  { href: '/installments', label: 'Installments', icon: icons.installments },
  { href: '/checklist', label: 'Checklist', icon: icons.checklist },
  { href: '/debts', label: 'Debts', icon: icons.debts },
  { href: '/tags', label: 'Tags', icon: icons.tags },
  { href: '/methods', label: 'Methods', icon: icons.methods },
  { href: '/account', label: 'Account', icon: icons.settings },
];

export function AppNav({
  children,
  userName,
  userEmail,
}: {
  children: ReactNode;
  userName: string | null;
  userEmail: string;
}) {
  const pathname = usePathname();
  return (
    <AppShell
      navItems={NAV_ITEMS}
      currentPath={pathname}
      linkComponent={Link}
      footerSlot={<UserMenu name={userName} email={userEmail} />}
    >
      {children}
    </AppShell>
  );
}
