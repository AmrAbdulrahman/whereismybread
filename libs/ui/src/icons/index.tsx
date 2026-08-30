import {
  ArrowLeftRight,
  Banknote,
  CalendarDays,
  CreditCard,
  Layers,
  ListChecks,
  Menu,
  Plus,
  RefreshCw,
  Repeat,
  Scale,
  Settings,
  Tag,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * The single place icons are chosen. Features reference `iconFor('debts')`
 * (or import a named icon) so swapping the icon set later is one file.
 */
export const icons = {
  calendar: CalendarDays,
  subscriptions: Repeat,
  installments: Layers,
  checklist: ListChecks,
  debts: Scale,
  tags: Tag,
  methods: Wallet,
  settings: Settings,
  overview: Menu,
  add: Plus,
  refresh: RefreshCw,
  transfer: ArrowLeftRight,
  card: CreditCard,
  cash: Banknote,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

export function iconFor(name: IconName): LucideIcon {
  return icons[name];
}

export type { LucideIcon };
export {
  ArrowLeftRight,
  Banknote,
  CalendarDays,
  CreditCard,
  Layers,
  ListChecks,
  Menu,
  Plus,
  RefreshCw,
  Repeat,
  Scale,
  Settings,
  Tag,
  Wallet,
};
