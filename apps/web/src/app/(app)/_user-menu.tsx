'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOutAction } from '@wib/auth';
import { cn, icons, ThemeToggle } from '@wib/ui';

export function UserMenu({
  name,
  email,
}: {
  name: string | null;
  email: string;
}) {
  const pathname = usePathname();
  const settingsActive =
    pathname === '/settings' || pathname.startsWith('/settings/');
  const SettingsIcon = icons.settings;

  return (
    <div className="flex flex-col gap-2 px-1">
      <Link
        href="/settings"
        aria-current={settingsActive ? 'page' : undefined}
        className={cn(
          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition-colors',
          settingsActive
            ? 'bg-surface-2 font-semibold text-ink'
            : 'text-muted hover:bg-surface-2 hover:text-ink',
        )}
      >
        <SettingsIcon size={16} strokeWidth={2} />
        Settings
      </Link>
      <div className="min-w-0 px-1.5">
        <div className="truncate text-[13px] font-medium text-ink">
          {name ?? 'Your account'}
        </div>
        <div className="truncate text-[11px] text-muted">{email}</div>
      </div>
      <ThemeToggle className="mx-1" />
      <form action={signOutAction}>
        <button
          type="submit"
          className="w-full rounded-md px-1.5 py-1 text-left text-[12px] text-muted hover:bg-surface-2 hover:text-ink"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
