import type { ElementType, ReactNode } from 'react';
import type { LucideIcon } from '../icons';
import { cn } from '../lib/cn';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface AppShellProps {
  navItems: NavItem[];
  /** Current pathname, for active state. */
  currentPath: string;
  /** e.g. Next's `Link`. Defaults to a plain anchor. */
  linkComponent?: ElementType;
  /** Primary items get a slot in the mobile tab bar; the rest go behind "More". */
  mobilePrimaryCount?: number;
  children: ReactNode;
}

function isActive(currentPath: string, href: string): boolean {
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function AppShell({
  navItems,
  currentPath,
  linkComponent: Link = 'a',
  mobilePrimaryCount = 5,
  children,
}: AppShellProps) {
  const primary = navItems.slice(0, mobilePrimaryCount);

  return (
    <div className="min-h-[100dvh] bg-ground text-ink">
      {/* Sidebar — lg and up */}
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-line bg-surface p-3 lg:flex">
        <div className="flex items-center gap-2 px-2 py-3">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-fg font-display text-sm font-bold">
            W
          </span>
          <span className="font-display text-[15px] font-bold tracking-tight">
            whereismymoney
          </span>
        </div>
        <nav className="mt-3 flex flex-col gap-0.5">
          {navItems.map((item) => {
            const active = isActive(currentPath, item.href);
            const Icon = item.icon;
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
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Content */}
      <div className="lg:pl-56">
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>

      {/* Bottom tab bar — below lg */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {primary.map((item) => {
          const active = isActive(currentPath, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium',
                active ? 'text-accent' : 'text-muted',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
