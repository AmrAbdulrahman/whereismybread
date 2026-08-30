import type { ReactNode } from 'react';

/** Temporary page body until the real feature lands in its phase. */
export function Placeholder({
  title,
  phase,
  children,
}: {
  title: string;
  phase: string;
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <span className="rounded-full border border-line-strong px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-muted">
          {phase}
        </span>
      </div>
      <p className="max-w-prose text-ink-soft">
        {children ??
          'This screen is scaffolded. Its feature library lands in the phase above.'}
      </p>
    </section>
  );
}
