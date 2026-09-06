import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-ground px-4">
      <div className="w-full max-w-sm">{children}</div>
      <p className="text-xs text-muted">
        <a href="/terms-and-conditions" className="underline hover:text-ink-soft">
          Terms
        </a>{' '}
        ·{' '}
        <a href="/privacy-policy" className="underline hover:text-ink-soft">
          Privacy
        </a>
      </p>
    </div>
  );
}
