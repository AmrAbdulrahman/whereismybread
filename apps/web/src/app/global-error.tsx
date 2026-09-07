'use client';

import './global.css';

import { useEffect } from 'react';
import { THEME_INIT_SCRIPT, Wordmark } from '@wib/ui';

/**
 * Last-resort boundary — catches anything the per-section `error.tsx` files
 * don't, including a failure in the root layout itself. It renders its own
 * `<html>`/`<body>`, so it can't rely on the normal shell (fonts, providers).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error]', error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-ground text-ink">
        <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
          <Wordmark />
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-xl font-semibold text-ink">
              Something went wrong
            </h1>
            <p className="max-w-sm text-sm text-ink-soft">
              The app hit an unexpected error. Reloading usually clears it —
              your data is safe.
            </p>
            {error.digest ? (
              <p className="text-[11px] text-muted">Ref: {error.digest}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                reset();
                window.location.reload();
              }}
              className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg hover:opacity-90"
            >
              Reload the app
            </button>
            <a
              href="/"
              className="inline-flex h-10 items-center rounded-md border border-line-strong px-4 text-sm font-medium text-ink-soft hover:text-ink"
            >
              Go home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
