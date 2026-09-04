'use client';

import { useEffect, useState, type ElementType, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Menu, X } from '../icons';
import type { NavItem } from './app-shell';
import { Sheet, SheetContent, SheetTitle } from './sheet';

function isActive(currentPath: string, href: string): boolean {
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

/**
 * The below-`lg` bottom tab bar: the first `primaryCount` destinations, then a
 * "More" tab that opens a sheet with everything else + the account controls.
 */
export function MobileNav({
  navItems,
  currentPath,
  linkComponent: Link = 'a',
  primaryCount,
  footerSlot,
}: {
  navItems: NavItem[];
  currentPath: string;
  linkComponent?: ElementType;
  primaryCount: number;
  footerSlot?: ReactNode;
}) {
  const primary = navItems.slice(0, primaryCount);
  const overflow = navItems.slice(primaryCount);
  const [open, setOpen] = useState(false);

  // Close the sheet whenever the route changes.
  useEffect(() => setOpen(false), [currentPath]);

  const overflowActive = overflow.some((i) => isActive(currentPath, i.href));

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {primary.map((item) => {
          const active = isActive(currentPath, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium',
                active ? 'text-accent' : 'text-muted',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={2} />
              <span className="max-w-full truncate px-0.5">
                {item.shortLabel ?? item.label}
              </span>
            </Link>
          );
        })}
        {overflow.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="More"
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium',
              overflowActive ? 'text-accent' : 'text-muted',
            )}
          >
            <Menu size={20} strokeWidth={2} />
            More
          </button>
        ) : null}
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] overflow-y-auto p-4 pb-6"
        >
          <div className="mb-3 flex items-center justify-between">
            <SheetTitle>More</SheetTitle>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {overflow.map((item) => {
              const active = isActive(currentPath, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-xs font-medium',
                    active
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-line text-ink-soft hover:bg-surface-2',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={20} strokeWidth={2} />
                  {item.label}
                </Link>
              );
            })}
          </div>
          {footerSlot ? (
            <div className="mt-4 border-t border-line pt-3">{footerSlot}</div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
