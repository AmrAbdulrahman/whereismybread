'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell, icons, type NavEntry } from '@wib/ui';
import { UserMenu } from './_user-menu';

// Notifications live in the sticky bell (top-right), not the nav.
const navItems: NavEntry[] = [
  { href: '/plan', label: 'Payments', icon: icons.calendar },
  { href: '/insights', label: 'Insights', icon: icons.insights },
  {
    href: '/checklist',
    label: 'Checklist',
    shortLabel: 'Checks',
    icon: icons.checklist,
  },
  {
    href: '/integrations',
    label: 'Integrations',
    shortLabel: 'Integr.',
    icon: icons.transactions,
  },
  {
    href: '/automations',
    label: 'Automations',
    shortLabel: 'Auto',
    icon: icons.automations,
  },

  { separator: true },
  {
    href: '/subscriptions',
    label: 'Subscriptions',
    shortLabel: 'Subs',
    icon: icons.subscriptions,
    comingSoon: true,
  },
  { href: '/budgets', label: 'Budgets', icon: icons.budgets },
  { href: '/debts', label: 'Debts', icon: icons.debts },

  { separator: true },
  { href: '/providers', label: 'Providers', icon: icons.providers },
  { href: '/banks', label: 'Banks', icon: icons.banks },
  { href: '/tags', label: 'Tags', icon: icons.tags },
  {
    href: '/methods',
    label: 'Methods',
    icon: icons.methods,
    comingSoon: true,
  },
  { href: '/accounts', label: 'Accounts', icon: icons.accounts },

  { separator: true },
  {
    href: '/installments',
    label: 'Installments',
    shortLabel: 'Instal.',
    icon: icons.installments,
    comingSoon: true,
  },
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
      navItems={navItems}
      currentPath={pathname}
      linkComponent={Link}
      footerSlot={<UserMenu name={userName} email={userEmail} />}
    >
      {children}
    </AppShell>
  );
}
