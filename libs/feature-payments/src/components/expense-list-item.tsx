'use client';

import { formatMoney } from '@wib/domain';
import { cn } from '@wib/ui';
import { FileText, Receipt } from '@wib/ui/icons';
import type { ExpenseLine } from '../lib/types';

/**
 * A recorded spend in the day-grouped list — visually distinct from a
 * planned payment (dashed border, a receipt mark instead of a checkbox) and
 * tagged with its budget when it has one. Click to edit; delete lives
 * inside the edit form.
 */
export function ExpenseListItem({
  expense,
  onEdit,
}: {
  expense: ExpenseLine;
  onEdit: () => void;
}) {
  const budgeted = expense.budgetId != null;
  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        'flex items-center gap-2.5 rounded-lg border border-dashed px-3 py-2 text-left transition-colors',
        'border-line-strong bg-surface/60 hover:border-accent/60',
      )}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
        <Receipt size={13} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm text-ink">{expense.name}</span>
          {expense.attachments.length > 0 ? (
            <FileText
              size={12}
              strokeWidth={2}
              className="shrink-0 text-muted"
            />
          ) : null}
        </span>
        {budgeted ? (
          <span className="flex items-center gap-1 text-[11px] text-muted">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: expense.budgetColor ?? undefined }}
            />
            <span className="truncate">{expense.budgetName}</span>
          </span>
        ) : expense.notes ? (
          <span className="block truncate text-[11px] text-muted">
            {expense.notes}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-sm font-medium text-ink-soft">
        {formatMoney(expense.amount)}
      </span>
    </button>
  );
}
