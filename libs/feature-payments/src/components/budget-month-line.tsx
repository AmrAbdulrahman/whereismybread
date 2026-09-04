'use client';

import { formatMoney } from '@wib/domain';
import type { BudgetSummary } from '../lib/types';

/**
 * A budget's reserved amount, pinned above a month's day groups. Unlike a
 * payment it has no paid/unpaid state — it's money set aside, not a due
 * obligation — so this is just a click-to-edit row, no checkbox.
 */
export function BudgetMonthLine({
  budget,
  onEdit,
}: {
  budget: BudgetSummary;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-line-strong"
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: budget.color }}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
        {budget.name}
      </span>
      <span className="shrink-0 rounded-full border border-line-strong px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
        Budget
      </span>
      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-ink">
        {formatMoney(budget.limit)}
      </span>
    </button>
  );
}
