import type { ElementType, ReactNode } from 'react';
import type { LucideIcon } from '../icons';
import { cn } from '../lib/cn';
import { MobileNav } from './mobile-nav';
import { Wordmark } from './wordmark';

export interface NavItem {
  href: string;
  label: string;
  /** A tighter label for the mobile tab bar (falls back to `label`). */
  shortLabel?: string;
  icon: LucideIcon;
  /** Rendered muted with a "Soon" pill and no navigation. */
  comingSoon?: boolean;
  /** A count pill (e.g. unread notifications). Omitted / 0 → nothing. */
  badge?: number;
}

/** The count pill shown next to a nav label. */
export function NavBadge({ count }: { count: number }) {
  if (!count || count < 1) return null;
  return (
    <span className="ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-ground">
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** A nav entry: a destination, or a group separator. */
export type NavEntry = NavItem | { separator: true };

export function isSeparator(e: NavEntry): e is { separator: true } {
  return 'separator' in e;
}

export interface AppShellProps {
  navItems: NavEntry[];
  /** Current pathname, for active state. */
  currentPath: string;
  /** e.g. Next's `Link`. Defaults to a plain anchor. */
  linkComponent?: ElementType;
  /** Primary items get a slot in the mobile tab bar; the rest go behind "More". */
  mobilePrimaryCount?: number;
  /** Rendered at the bottom of the sidebar — e.g. the signed-in user + sign out. */
  footerSlot?: ReactNode;
  children: ReactNode;
}

function isActive(currentPath: string, href: string): boolean {
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function AppShell({
  navItems,
  currentPath,
  linkComponent: Link = 'a',
  mobilePrimaryCount = 4,
  footerSlot,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-[100dvh] bg-ground text-ink">
      {/* Sidebar — lg and up */}
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-line bg-surface p-3 lg:flex">
        <div className="px-2 py-3">
          <Wordmark size="sm" />
        </div>
        <nav className="mt-3 flex flex-col gap-0.5">
          {navItems.map((item, i) => {
            if (isSeparator(item)) {
              return (
                <div
                  key={`sep-${i}`}
                  className="mx-2.5 my-1.5 h-px bg-line"
                  role="separator"
                />
              );
            }
            const Icon = item.icon;
            if (item.comingSoon) {
              return (
                <span
                  key={item.href}
                  aria-disabled
                  className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] text-muted/50"
                >
                  <Icon size={16} strokeWidth={2} />
                  {item.label}
                  <span className="ml-auto rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                    Soon
                  </span>
                </span>
              );
            }
            const active = isActive(currentPath, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition-colors',
                  active
                    ? 'bg-surface-2 font-semibold text-ink'
                    : 'text-muted hover:bg-surface-2 hover:text-ink',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={16} strokeWidth={2} />
                {item.label}
                <NavBadge count={item.badge ?? 0} />
              </Link>
            );
          })}
        </nav>
        {footerSlot ? (
          <div className="mt-auto border-t border-line pt-3">{footerSlot}</div>
        ) : null}
      </aside>

      {/* Content */}
      <div className="lg:pl-56">
        <main className="mx-auto max-w-5xl px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-6 lg:pb-10">
          {children}
        </main>
      </div>

      <MobileNav
        navItems={navItems}
        currentPath={currentPath}
        linkComponent={Link}
        primaryCount={mobilePrimaryCount}
        footerSlot={footerSlot}
      />
    </div>
  );
}
