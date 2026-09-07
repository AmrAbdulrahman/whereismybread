'use client';

import { useEffect } from 'react';
import { Wordmark } from '@wib/ui';

/**
 * Catches a render/data error anywhere under `/(app)` while keeping the nav
 * shell. "Try again" re-runs the failed segment; "Reload" is the hard fallback
 * for a stuck client.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app-error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
      <Wordmark />
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-lg font-semibold text-ink">
          This page didn&apos;t load
        </h1>
        <p className="max-w-xs text-sm text-ink-soft">
          Something went wrong on our side. Your data is safe — try again, or
          reload the app.
        </p>
        {error.digest ? (
          <p className="text-[11px] text-muted">Ref: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg hover:opacity-90"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex h-10 items-center rounded-md border border-line-strong px-4 text-sm font-medium text-ink-soft hover:text-ink"
        >
          Reload the app
        </button>
      </div>
    </div>
  );
}
