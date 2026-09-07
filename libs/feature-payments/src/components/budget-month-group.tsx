'use client';

import { useState } from 'react';
import { formatMoney, money, type RateMap } from '@wib/domain';
import { cn } from '@wib/ui';
import { ChevronDown, PiggyBank } from '@wib/ui/icons';
import { sumInDisplay } from '../lib/risk';
import type { BudgetSummary } from '../lib/types';
import { BudgetMonthLine } from './budget-month-line';
import { BudgetProgressBar } from './budget-progress-bar';

/**
 * The month's budgets, rolled into one collapsible line pinned to the sticky
 * month header. Collapsed by default — it shows a combined progress bar and
 * spent / total across every budget for the month; expand it for the
 * individual envelopes. A closed budget contributes only what it spent to the
 * total (its remainder is no longer reserved).
 */
export function BudgetMonthGroup({
  budgets,
  displayCurrency,
  rates,
  onEdit,
}: {
  budgets: BudgetSummary[];
  displayCurrency: string;
  rates: RateMap;
  onEdit: (budget: BudgetSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  if (budgets.length === 0) return null;

  const spentMinor = sumInDisplay(
    budgets.map((b) => money(b.spentMinor, b.limit.currency)),
    displayCurrency,
    rates,
  );
  const totalMinor = sumInDisplay(
    budgets.map((b) =>
      b.closedAt ? money(b.spentMinor, b.limit.currency) : b.limit,
    ),
    displayCurrency,
    rates,
  );
  const progress = totalMinor > 0 ? spentMinor / totalMinor : 0;
  const over = progress > 1;
  const closedCount = budgets.filter((b) => b.closedAt).length;

  return (
    <div className="flex flex-col gap-1 border-t border-line pt-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 text-xs"
      >
        <PiggyBank size={12} strokeWidth={2} className="shrink-0 text-muted" />
        <span className="shrink-0 font-medium text-ink-soft">
          {budgets.length === 1 ? '1 budget' : `${budgets.length} budgets`}
          {closedCount > 0 ? (
            <span className="text-muted"> · {closedCount} closed</span>
          ) : null}
        </span>
        <BudgetProgressBar
          progress={progress}
          color="var(--wib-accent)"
          className="h-1"
        />
        <span
          className={cn(
            'shrink-0 font-mono tabular-nums',
            over ? 'text-danger' : 'text-muted',
          )}
        >
          {formatMoney(money(spentMinor, displayCurrency))} /{' '}
          {formatMoney(money(totalMinor, displayCurrency))}
        </span>
        <ChevronDown
          size={12}
          strokeWidth={2.5}
          className={cn(
            'shrink-0 text-muted transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open ? (
        <div className="flex flex-col gap-1 pl-1 pt-0.5">
          {budgets.map((b) => (
            <BudgetMonthLine key={b.id} budget={b} onEdit={() => onEdit(b)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
