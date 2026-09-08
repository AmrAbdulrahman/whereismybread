'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney } from '@wib/domain';
import { cn } from '@wib/ui';
import { FileText, PiggyBank, Receipt } from '@wib/ui/icons';
import { assignExpenseAction } from '../lib/budget-actions';
import type { ExpenseLine, OccurrenceTag } from '../lib/types';
import {
  InlineAssignChip,
  InlineTagChip,
  type AssignOption,
} from './inline-assign-chip';

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
  assign,
}: {
  expense: ExpenseLine;
  onEdit: () => void;
  /**
   * Enables the inline "+ account" / "+ budget" / "+ tag" chips — picking one
   * assigns it immediately in the UI and saves in the background. `tags` is
   * the suggestion list. Omit to hide the chips.
   */
  assign?: {
    accounts: AssignOption[];
    budgets: AssignOption[];
    tags: { name: string; color: string }[];
  };
}) {
  const router = useRouter();
  const time = expenseTimeLabel(expense.occurredAt);
  const showAssign = assign != null;

  // Optimistic inline assign — reflect the pick now, save + refresh in the
  // background, drop the override once the server list catches up.
  const [optAccountId, setOptAccountId] = useState<string | null>(null);
  const [optAccountColor, setOptAccountColor] = useState<string | null>(null);
  const [optAccountName, setOptAccountName] = useState<string | null>(null);
  const [optBudgetId, setOptBudgetId] = useState<string | null>(null);
  const [optBudgetColor, setOptBudgetColor] = useState<string | null>(null);
  const [optBudgetName, setOptBudgetName] = useState<string | null>(null);
  const [optTags, setOptTags] = useState<OccurrenceTag[] | null>(null);

  const accountId = optAccountId ?? expense.accountId;
  const accountName = optAccountId ? optAccountName : expense.accountName;
  const accountColor = optAccountId ? optAccountColor : expense.accountColor;
  const budgetId = optBudgetId ?? expense.budgetId;
  const budgetName = optBudgetId ? optBudgetName : expense.budgetName;
  const budgetColor = optBudgetId ? optBudgetColor : expense.budgetColor;
  const tags = optTags ?? expense.tags;
  const tagSig = expense.tags.map((t) => t.id).join(',');

  useEffect(() => setOptAccountId(null), [expense.accountId]);
  useEffect(() => setOptBudgetId(null), [expense.budgetId]);
  useEffect(() => setOptTags(null), [tagSig]);

  const save = (patch: {
    accountId?: string | null;
    budgetId?: string | null;
    tags?: string[];
  }) => {
    void assignExpenseAction(expense.id, patch).then(() => router.refresh());
  };

  const hasMeta =
    budgetId != null ||
    accountId != null ||
    expense.bankId != null ||
    tags.length > 0 ||
    showAssign;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === 'Enter' || e.key === ' ')
        ) {
          e.preventDefault();
          onEdit();
        }
      }}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-lg border border-dashed px-3 py-2 text-left transition-colors',
        'border-line-strong bg-surface/60 hover:border-accent/60',
      )}
    >
      {expense.logoUrl ? (
        <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface">
          <img
            src={expense.logoUrl}
            alt=""
            className="h-full w-full object-contain"
          />
        </span>
      ) : (
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
          <Receipt size={13} strokeWidth={2} />
        </span>
      )}
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
            {accountId ? (
              <span className="flex items-center gap-1">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: accountColor ?? undefined }}
                />
                <span className="truncate">{accountName}</span>
              </span>
            ) : showAssign && assign ? (
              <InlineAssignChip
                label="account"
                options={assign.accounts}
                onPick={(id) => {
                  const a = assign.accounts.find((x) => x.id === id);
                  setOptAccountId(id);
                  setOptAccountName(a?.name ?? null);
                  setOptAccountColor(a?.color ?? null);
                  save({ accountId: id });
                }}
              />
            ) : null}
            {budgetId ? (
              <span className="flex items-center gap-1">
                <PiggyBank
                  size={12}
                  strokeWidth={2}
                  className="shrink-0"
                  style={{ color: budgetColor ?? undefined }}
                />
                <span className="truncate">{budgetName}</span>
              </span>
            ) : showAssign && assign ? (
              <InlineAssignChip
                label="budget"
                icon={<PiggyBank size={10} strokeWidth={2.5} />}
                options={assign.budgets}
                onPick={(id) => {
                  const b = assign.budgets.find((x) => x.id === id);
                  setOptBudgetId(id);
                  setOptBudgetName(b?.name ?? null);
                  setOptBudgetColor(b?.color ?? null);
                  save({ budgetId: id });
                }}
              />
            ) : null}
            {expense.bankId ? (
              <span className="flex items-center gap-1">
                {expense.bankLogoUrl ? (
                  <img
                    src={expense.bankLogoUrl}
                    alt=""
                    className="h-3 w-3 shrink-0 rounded-sm object-contain"
                  />
                ) : (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: expense.bankColor ?? undefined }}
                  />
                )}
                <span className="truncate">{expense.bankName}</span>
              </span>
            ) : null}
            {tags.map((t) => (
              <span
                key={t.id}
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ background: `${t.color}22`, color: t.color }}
              >
                {t.name}
              </span>
            ))}
            {showAssign && assign ? (
              <InlineTagChip
                value={tags.map((t) => t.name)}
                suggestions={assign.tags}
                onChange={(names) => {
                  setOptTags(
                    names.map((n) => {
                      const lc = n.toLowerCase();
                      const existing = expense.tags.find(
                        (t) => t.name.toLowerCase() === lc,
                      );
                      const suggested = assign.tags.find(
                        (t) => t.name.toLowerCase() === lc,
                      );
                      return {
                        id: existing?.id ?? n,
                        name: n,
                        color:
                          existing?.color ?? suggested?.color ?? '#6321d6',
                      };
                    }),
                  );
                  save({ tags: names });
                }}
              />
            ) : null}
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
    </div>
  );
}
