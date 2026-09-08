'use client';

import { formatMoney, money } from '@wib/domain';
import { cn } from '@wib/ui';
import { CalendarDays, Pencil, Receipt, X } from '@wib/ui/icons';
import type { BankTransactionRow as BankTransactionRowData } from '../lib/bank-sync-queries';

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

/**
 * One imported-but-uncategorized transaction. It has no natural "edit"
 * target yet — it needs one of three actions to become something. The
 * parent owns visibility, so a triaged row leaves the list immediately.
 *
 * `variant="day"` drops the date (the plan list's day header already shows
 * it) and leans on a warn-tinted border to read as "needs review".
 */
export function BankTransactionRow({
  txn,
  variant = 'inbox',
  selectable = false,
  selected = false,
  onSelectedChange,
  onLogExpense,
  onCreatePayment,
  onIgnore,
  onEdit,
}: {
  txn: BankTransactionRowData;
  variant?: 'inbox' | 'day';
  /** Show a leading checkbox for bulk actions (inbox only). */
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (checked: boolean) => void;
  onLogExpense: () => void;
  onCreatePayment: () => void;
  onIgnore: () => void;
  /** "Edit details" — stamp triage hints onto the row (inbox only). */
  onEdit?: () => void;
}) {
  const negative = txn.amountMinor < 0;
  const meta = [
    variant === 'day' ? null : dateLabel(txn.occurredAt),
    txn.hasTime ? timeLabel(txn.occurredAt) : null,
    txn.balanceName,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border px-3 py-2.5',
        variant === 'day'
          ? 'border-warn/40 bg-warn/[0.06]'
          : selected
            ? 'border-accent bg-accent/[0.06]'
            : 'border-line bg-surface',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        {selectable ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelectedChange?.(e.target.checked)}
            aria-label={`Select ${txn.merchant || txn.description}`}
            className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
          />
        ) : null}
        {txn.logoUrl ? (
          <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface">
            <img
              src={txn.logoUrl}
              alt=""
              className="h-full w-full object-contain"
            />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm text-ink">
            {variant === 'day' ? (
              <span className="shrink-0 rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn">
                Review
              </span>
            ) : null}
            <span className="truncate" title={txn.description}>
              {txn.displayName || txn.description}
            </span>
          </p>
          {(txn.displayName || txn.merchant) &&
          (txn.displayName || txn.merchant) !== txn.description ? (
            <p className="truncate text-[11px] text-muted" title={txn.description}>
              {txn.description}
            </p>
          ) : null}
          {meta ? <p className="text-[11px] text-muted">{meta}</p> : null}
          {txn.tags.length > 0 ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-1">
              {txn.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-soft"
                >
                  {t}
                </span>
              ))}
            </p>
          ) : null}
        </div>
        <span
          className={cn(
            'shrink-0 font-mono text-sm font-semibold tabular-nums',
            negative ? 'text-ink' : 'text-good',
          )}
        >
          {negative ? '' : '+'}
          {formatMoney(money(txn.amountMinor, txn.currency))}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onLogExpense}
          className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:border-accent/60 hover:text-ink"
        >
          <Receipt size={12} strokeWidth={2} />
          Log as expense
        </button>
        <button
          type="button"
          onClick={onCreatePayment}
          className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:border-accent/60 hover:text-ink"
        >
          <CalendarDays size={12} strokeWidth={2} />
          Create a planned payment
        </button>
        {onEdit && variant === 'inbox' ? (
          <button
            type="button"
            onClick={onEdit}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:text-ink"
          >
            <Pencil size={12} strokeWidth={2} />
            Edit details
          </button>
        ) : null}
        <button
          type="button"
          onClick={onIgnore}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:text-ink',
            !(onEdit && variant === 'inbox') && 'ml-auto',
          )}
        >
          <X size={12} strokeWidth={2} />
          Ignore
        </button>
      </div>
    </div>
  );
}
