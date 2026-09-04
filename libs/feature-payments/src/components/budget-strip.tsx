'use client';

import Link from 'next/link';
import { formatMoney, money } from '@wib/domain';
import { cn } from '@wib/ui';
import type { BudgetSummary } from '../lib/types';

/**
 * A compact, horizontally-scrolling line of budget chips for the plan
 * header — "a simple line of progress and value" per budget whose period
 * overlaps the month or week currently in view.
 */
export function BudgetStrip({ budgets }: { budgets: BudgetSummary[] }) {
  if (budgets.length === 0) return null;

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {budgets.map((b) => {
        const over = b.progress > 1;
        const pct = Math.min(b.progress, 1) * 100;
        return (
          <Link
            key={b.id}
            href="/budgets"
            className="flex w-40 shrink-0 flex-col gap-1 rounded-lg border border-line bg-surface px-2.5 py-2 transition-colors hover:border-line-strong"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: b.color }}
                />
                <span className="truncate text-[11px] font-medium text-ink">
                  {b.name}
                </span>
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: over ? 'var(--wib-danger)' : b.color,
                }}
              />
            </div>
            <span
              className={cn(
                'text-[10px]',
                over ? 'text-danger' : 'text-muted',
              )}
            >
              {formatMoney(money(b.spentMinor, b.limit.currency))} /{' '}
              {formatMoney(b.limit)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
