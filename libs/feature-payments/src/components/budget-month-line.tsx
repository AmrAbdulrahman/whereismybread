'use client';

import { formatMoney, money } from '@wib/domain';
import { cn } from '@wib/ui';
import { Pencil, Repeat } from '@wib/ui/icons';
import type { BudgetSummary } from '../lib/types';
import { BudgetProgressBar } from './budget-progress-bar';

/**
 * A budget's reserved amount, pinned to the sticky month header alongside
 * the other budgets for that month. Unlike a payment it has no paid/unpaid
 * state — it's money set aside, not a due obligation — so this is a single
 * thin info line with its own small edit button, not a checkbox row.
 */
export function BudgetMonthLine({
  budget,
  onEdit,
}: {
  budget: BudgetSummary;
  onEdit: () => void;
}) {
  const over = budget.progress > 1;
  return (
    <div
      role="group"
      aria-label={`${budget.name} budget`}
      className="flex items-center gap-2 text-xs"
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: budget.color }}
      />
      <span className="max-w-[7rem] shrink-0 truncate font-medium text-ink-soft">
        {budget.name}
      </span>
      {budget.recurring ? (
        <Repeat
          size={10}
          strokeWidth={2}
          className="shrink-0 text-muted"
          aria-label="Repeats monthly"
        />
      ) : null}
      <BudgetProgressBar
        progress={budget.progress}
        color={budget.color}
        className="h-1"
      />
      <span
        className={cn(
          'shrink-0 font-mono tabular-nums',
          over ? 'text-danger' : 'text-muted',
        )}
      >
        {formatMoney(money(budget.spentMinor, budget.limit.currency))} /{' '}
        {formatMoney(budget.limit)}
      </span>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${budget.name} budget`}
        className="shrink-0 rounded p-1 text-muted hover:text-ink"
      >
        <Pencil size={12} />
      </button>
    </div>
  );
}
