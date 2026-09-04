'use client';

import { cn } from '@wib/ui';

/** A budget's spend against its limit — red once it's over. */
export function BudgetProgressBar({
  progress,
  color,
  className,
}: {
  progress: number;
  color: string;
  className?: string;
}) {
  const pct = Math.min(progress, 1) * 100;
  const over = progress > 1;
  return (
    <div
      className={cn(
        'h-2 w-full overflow-hidden rounded-full bg-surface-2',
        className,
      )}
    >
      <div
        className="h-full rounded-full transition-[width]"
        style={{
          width: `${pct}%`,
          background: over ? 'var(--wib-danger)' : color,
        }}
      />
    </div>
  );
}
