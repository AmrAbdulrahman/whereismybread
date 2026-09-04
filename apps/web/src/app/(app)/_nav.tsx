'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell, icons, type NavItem } from '@wib/ui';
import { UserMenu } from './_user-menu';

const NAV_ITEMS: NavItem[] = [
  { href: '/plan', label: 'Plan', icon: icons.calendar },
  {
    href: '/subscriptions',
    label: 'Subscriptions',
    shortLabel: 'Subs',
    icon: icons.subscriptions,
  },
  {
    href: '/installments',
    label: 'Installments',
    shortLabel: 'Instal.',
    icon: icons.installments,
  },
  { href: '/checklist', label: 'Checklist', shortLabel: 'Checks', icon: icons.checklist },
  { href: '/budgets', label: 'Budgets', icon: icons.budgets },
  { href: '/debts', label: 'Debts', icon: icons.debts },
  { href: '/tags', label: 'Tags', icon: icons.tags },
  { href: '/accounts', label: 'Accounts', icon: icons.accounts },
  { href: '/banks', label: 'Banks', icon: icons.banks },
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
