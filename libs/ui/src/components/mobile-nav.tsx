'use client';

import { useEffect, useState, type ElementType, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Menu, X } from '../icons';
import { NavBadge, isSeparator, type NavEntry, type NavItem } from './app-shell';
import { Sheet, SheetContent, SheetTitle } from './sheet';

function isActive(currentPath: string, href: string): boolean {
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

/** Drop leading/trailing/consecutive separators. */
function tidySeparators(entries: NavEntry[]): NavEntry[] {
  const out: NavEntry[] = [];
  for (const e of entries) {
    const last = out.at(-1);
    if (isSeparator(e) && (!last || isSeparator(last))) continue;
    out.push(e);
  }
  let last = out.at(-1);
  while (last && isSeparator(last)) {
    out.pop();
    last = out.at(-1);
  }
  return out;
}

/**
 * The below-`lg` bottom tab bar: the first `primaryCount` real destinations,
 * then a "More" tab whose sheet holds everything else — group separators and
 * "coming soon" entries included.
 */
export function MobileNav({
  navItems,
  currentPath,
  linkComponent: Link = 'a',
  primaryCount,
  footerSlot,
}: {
  navItems: NavEntry[];
  currentPath: string;
  linkComponent?: ElementType;
  primaryCount: number;
  footerSlot?: ReactNode;
}) {
  const items = navItems.filter((e): e is NavItem => !isSeparator(e));
  const primary = items.filter((i) => !i.comingSoon).slice(0, primaryCount);
  const primaryHrefs = new Set(primary.map((i) => i.href));
  const overflow = tidySeparators(
    navItems.filter((e) => isSeparator(e) || !primaryHrefs.has(e.href)),
  );

  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [currentPath]);

  const overflowActive = overflow.some(
    (e) => !isSeparator(e) && !e.comingSoon && isActive(currentPath, e.href),
  );

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
              <span className="relative">
                <Icon size={20} strokeWidth={2} />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -right-2 -top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-accent px-0.5 text-[9px] font-semibold leading-none text-ground">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                ) : null}
              </span>
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
            {overflow.map((entry, i) => {
              if (isSeparator(entry)) {
                return (
                  <div
                    key={`sep-${i}`}
                    className="col-span-3 my-1 h-px bg-line"
                    role="separator"
                  />
                );
              }
              const Icon = entry.icon;
              if (entry.comingSoon) {
                return (
                  <span
                    key={entry.href}
                    aria-disabled
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-line/60 px-2 py-3 text-center text-xs font-medium text-muted/50"
                  >
                    <Icon size={20} strokeWidth={2} />
                    {entry.label}
                    <span className="rounded-full bg-surface-2 px-1.5 text-[9px] text-muted">
                      Soon
                    </span>
                  </span>
                );
              }
              const active = isActive(currentPath, entry.href);
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
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
                  <span className="flex items-center gap-1">
                    {entry.label}
                    <NavBadge count={entry.badge ?? 0} />
                  </span>
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
