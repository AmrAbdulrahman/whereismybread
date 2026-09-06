'use client';

import { formatMoney } from '@wib/domain';
import { cn } from '@wib/ui';
import { FileText, Receipt } from '@wib/ui/icons';
import type { ExpenseLine } from '../lib/types';

/** "16:57" for a CSV-imported expense that carried a time; "" otherwise. */
export function expenseTimeLabel(occurredAt: string | null): string {
  if (!occurredAt) return '';
  const d = new Date(occurredAt);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      });
}

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
  const time = expenseTimeLabel(expense.occurredAt);
  const hasMeta =
    budgeted || expense.accountId != null || expense.tags.length > 0;
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
          {time ? (
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
              {time}
            </span>
          ) : null}
          {expense.attachments.length > 0 ? (
            <FileText
              size={12}
              strokeWidth={2}
              className="shrink-0 text-muted"
            />
          ) : null}
        </span>
        {hasMeta ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
            {budgeted ? (
              <span className="flex items-center gap-1">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: expense.budgetColor ?? undefined }}
                />
                <span className="truncate">{expense.budgetName}</span>
              </span>
            ) : null}
            {expense.accountId ? (
              <span className="flex items-center gap-1">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: expense.accountColor ?? undefined }}
                />
                <span className="truncate">{expense.accountName}</span>
              </span>
            ) : null}
            {expense.tags.map((t) => (
              <span
                key={t.id}
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ background: `${t.color}22`, color: t.color }}
              >
                {t.name}
              </span>
            ))}
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
