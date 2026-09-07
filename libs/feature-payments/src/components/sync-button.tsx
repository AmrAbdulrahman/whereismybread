'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn, MethodIcon, useToast } from '@wib/ui';
import { RefreshCw } from '@wib/ui/icons';
import type { SyncTarget } from '../lib/bank-sync-queries';
import { syncNowAction } from '../lib/bank-connection-actions';

const MENU_WIDTH = 208; // w-52

/**
 * Toolbar sync control: a button that, like the add FAB, expands into a
 * short menu of the banks with a live integration. Picking one pulls in new
 * transactions. Only rendered when there's at least one integration.
 */
export function SyncButton({ targets }: { targets: SyncTarget[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  // Position the menu under the button, clamped to the viewport so it never
  // spills off either edge (the button can sit anywhere in the toolbar).
  useEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.max(
        8,
        Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8),
      );
      setCoords({ top: r.bottom + 6, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

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
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => !pending && setOpen((o) => !o)}
        aria-label="Sync bank transactions"
        aria-expanded={open}
        disabled={pending}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium sm:px-3',
          pending || open
            ? 'border-accent text-accent'
            : 'border-line-strong text-muted hover:text-ink',
        )}
      >
        <RefreshCw size={15} className={cn(pending && 'animate-spin')} />
        <span className="hidden sm:inline">{pending ? 'Syncing…' : 'Sync'}</span>
      </button>

      {open && coords ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            style={{ top: coords.top, left: coords.left, width: MENU_WIDTH }}
            className="fixed z-50 flex flex-col rounded-lg border border-line bg-surface p-1 shadow-lg"
          >
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
    </>
  );
}
