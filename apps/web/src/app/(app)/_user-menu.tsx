'use client';

import Link from 'next/link';
import { signOutAction } from '@wib/auth';
import { ThemeToggle } from '@wib/ui';

export function UserMenu({
  name,
  email,
}: {
  name: string | null;
  email: string;
}) {
  return (
    <div className="flex flex-col gap-2 px-1">
      <Link
        href="/account"
        className="min-w-0 rounded-md px-1.5 py-1 hover:bg-surface-2"
      >
        <div className="truncate text-[13px] font-medium text-ink">
          {name ?? 'Your account'}
        </div>
        <div className="truncate text-[11px] text-muted">{email}</div>
      </Link>
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
