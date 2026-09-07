'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn, MethodIcon, useToast } from '@wib/ui';
import { RefreshCw } from '@wib/ui/icons';
import type { SyncTarget } from '../lib/bank-sync-queries';
import { syncNowAction } from '../lib/bank-connection-actions';



/**
 * Toolbar sync control: a button that, like the add FAB, expands into a
 * short menu of the banks with a live integration. Picking one pulls in new
 * transactions. Only rendered when there's at least one integration.
 */
export function SyncButton({ targets }: { targets: SyncTarget[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (targets.length === 0) return null;

  const run = (connectionId: string) =>
    startTransition(async () => {
      setOpen(false);
      const res = await syncNowAction(connectionId);
      toast(
        res.ok
          ? {
              title:
                res.imported === 0
                  ? 'Up to date'
                  : `Pulled in ${res.imported} new transaction${res.imported === 1 ? '' : 's'}`,
              duration: 4000,
            }
          : { title: 'Sync failed', description: res.error, duration: 6000 },
      );
      router.refresh();
    });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !pending && setOpen((o) => !o)}
        aria-label="Sync bank transactions"
        aria-expanded={open}
        disabled={pending}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium',
          pending || open
            ? 'border-accent text-accent'
            : 'border-line-strong text-muted hover:text-ink',
        )}
      >
        <RefreshCw size={15} className={cn(pending && 'animate-spin')} />
        <span className="hidden sm:inline">{pending ? 'Syncing…' : 'Sync'}</span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 z-50 mt-1.5 flex min-w-48 flex-col rounded-lg border border-line bg-surface p-1 shadow-lg">
            <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
              Sync now
            </p>
            {targets.map((t) => (
              <button
                key={t.connectionId}
                type="button"
                onClick={() => run(t.connectionId)}
                className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-surface-2"
              >
                {t.iconKey || t.logoUrl ? (
                  <MethodIcon
                    iconKey={t.iconKey ?? 'bank'}
                    logoUrl={t.logoUrl}
                    size={15}
                  />
                ) : (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: t.color }}
                  />
                )}
                {t.name}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
