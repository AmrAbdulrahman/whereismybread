'use client';

import { useState } from 'react';
import { formatMoney, money, type IsoDate } from '@wib/domain';
import { Button, ResponsiveModal, cn } from '@wib/ui';
import { FileText, Pencil, Plus, Trash2 } from '@wib/ui/icons';
import { deleteBudgetAction, deleteExpenseAction } from '../lib/budget-actions';
import type { BudgetExpenseView, BudgetSummary } from '../lib/types';
import { BudgetForm, type BudgetFormInitial } from './budget-form';
import { ExpenseForm, type ExpenseFormInitial } from './expense-form';

function periodLabel(b: BudgetSummary): string {
  const fmt = (d: string, withYear: boolean) =>
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    }).format(new Date(`${d}T00:00:00Z`));
  if (b.period === 'month') {
    return new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${b.startDate}T00:00:00Z`));
  }
  return `${fmt(b.startDate, false)} – ${fmt(b.endDate, true)}`;
}

function ProgressBar({
  progress,
  color,
}: {
  progress: number;
  color: string;
}) {
  const pct = Math.min(progress, 1) * 100;
  const over = progress > 1;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
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

function toBudgetFormInitial(b: BudgetSummary): BudgetFormInitial {
  return {
    id: b.id,
    name: b.name,
    period: b.period,
    startDate: b.startDate,
    endDate: b.endDate,
    amountMinor: b.limit.minorUnits,
    currency: b.limit.currency,
    color: b.color,
  };
}

function toExpenseFormInitial(
  budgetId: string,
  e: BudgetExpenseView,
): ExpenseFormInitial {
  return {
    id: e.id,
    budgetId,
    name: e.name,
    amountMinor: e.amount.minorUnits,
    currency: e.amount.currency,
    notes: e.notes,
    attachments: e.attachments,
  };
}

export function BudgetsView({
  budgets,
  today,
  defaultCurrency,
  usedCurrencies,
}: {
  budgets: BudgetSummary[];
  today: string;
  defaultCurrency: string;
  usedCurrencies: string[];
}) {
  const [formOpen, setFormOpen] = useState<
    { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; budget: BudgetSummary }
  >({ mode: 'closed' });
  const [expenseOpen, setExpenseOpen] = useState<
    | { mode: 'closed' }
    | { mode: 'new'; budgetId: string }
    | { mode: 'edit'; budgetId: string; expense: BudgetExpenseView }
  >({ mode: 'closed' });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmDeleteBudget, setConfirmDeleteBudget] =
    useState<BudgetSummary | null>(null);
  const [confirmDeleteExpense, setConfirmDeleteExpense] = useState<{
    budgetId: string;
    expense: BudgetExpenseView;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runDeleteBudget = async (b: BudgetSummary) => {
    setBusy(true);
    try {
      await deleteBudgetAction(b.id);
      setConfirmDeleteBudget(null);
    } finally {
      setBusy(false);
    }
  };

  const runDeleteExpense = async (e: BudgetExpenseView) => {
    setBusy(true);
    try {
      await deleteExpenseAction(e.id);
      setConfirmDeleteExpense(null);
    } finally {
      setBusy(false);
    }
  };

  const budgetOptions = budgets.map((b) => ({
    id: b.id,
    name: b.name,
    currency: b.limit.currency,
  }));

  const emptyState = budgets.length === 0;

  return (
    <div className="flex flex-col gap-5">
      {emptyState ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <h1 className="text-xl font-semibold">No budgets yet</h1>
          <p className="max-w-xs text-sm text-ink-soft">
            Create a budget for a month or a week, then log expenses against
            it to track your spending.
          </p>
          <Button size="lg" onClick={() => setFormOpen({ mode: 'new' })}>
            <Plus size={18} strokeWidth={3} />
            New budget
          </Button>
        </div>
      ) : (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold sm:text-2xl">Budgets</h1>
              <p className="mt-0.5 text-[13px] text-ink-soft sm:text-sm">
                {budgets.length} {budgets.length === 1 ? 'budget' : 'budgets'}
              </p>
            </div>
            <Button
              size="sm"
              className="sm:h-10 sm:px-4"
              onClick={() => setFormOpen({ mode: 'new' })}
            >
              <Plus size={16} strokeWidth={3} />
              New budget
            </Button>
          </header>

          <ul className="flex flex-col gap-3">
            {budgets.map((b) => {
              const isOpen = expanded.has(b.id);
              const over = b.progress > 1;
              return (
                <li
                  key={b.id}
                  className="rounded-xl border border-line bg-surface p-3.5 sm:p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => toggle(b.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: b.color }}
                        />
                        <span className="truncate text-sm font-semibold text-ink sm:text-base">
                          {b.name}
                        </span>
                        <span className="shrink-0 rounded-full border border-line-strong px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                          {b.period}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {periodLabel(b)}
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Edit ${b.name}`}
                        onClick={() => setFormOpen({ mode: 'edit', budget: b })}
                        className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                      >
                        <Pencil size={14} strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${b.name}`}
                        onClick={() => setConfirmDeleteBudget(b)}
                        className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
                      >
                        <Trash2 size={14} strokeWidth={2} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-1.5">
                    <ProgressBar progress={b.progress} color={b.color} />
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={cn(
                          'font-medium',
                          over ? 'text-danger' : 'text-ink',
                        )}
                      >
                        {formatMoney(money(b.spentMinor, b.limit.currency))}{' '}
                        spent
                      </span>
                      <span className="text-muted">
                        of {formatMoney(b.limit)}
                        {over ? (
                          <span className="ml-1 text-danger">
                            ·{' '}
                            {formatMoney(
                              money(-b.remainingMinor, b.limit.currency),
                            )}{' '}
                            over
                          </span>
                        ) : (
                          <span className="ml-1">
                            ·{' '}
                            {formatMoney(
                              money(b.remainingMinor, b.limit.currency),
                            )}{' '}
                            left
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  {isOpen ? (
                    <div className="mt-3.5 flex flex-col gap-2 border-t border-line/60 pt-3">
                      {b.expenses.length === 0 ? (
                        <p className="text-xs text-muted">
                          No expenses logged yet.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1.5">
                          {b.expenses.map((e) => (
                            <li
                              key={e.id}
                              className="flex items-center gap-2 rounded-lg border border-line/60 bg-ground px-2.5 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-sm text-ink">
                                    {e.name}
                                  </span>
                                  {e.attachments.length > 0 ? (
                                    <FileText
                                      size={12}
                                      strokeWidth={2}
                                      className="shrink-0 text-muted"
                                    />
                                  ) : null}
                                </div>
                                {e.notes ? (
                                  <p className="truncate text-[11px] text-muted">
                                    {e.notes}
                                  </p>
                                ) : null}
                              </div>
                              <span className="shrink-0 text-sm font-medium text-ink">
                                {formatMoney(e.amount)}
                              </span>
                              <button
                                type="button"
                                aria-label={`Edit ${e.name}`}
                                onClick={() =>
                                  setExpenseOpen({
                                    mode: 'edit',
                                    budgetId: b.id,
                                    expense: e,
                                  })
                                }
                                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                              >
                                <Pencil size={12} strokeWidth={2} />
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete ${e.name}`}
                                onClick={() =>
                                  setConfirmDeleteExpense({
                                    budgetId: b.id,
                                    expense: e,
                                  })
                                }
                                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
                              >
                                <Trash2 size={12} strokeWidth={2} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        onClick={() =>
                          setExpenseOpen({ mode: 'new', budgetId: b.id })
                        }
                      >
                        <Plus size={14} strokeWidth={2.5} />
                        Add expense
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <ResponsiveModal
        open={formOpen.mode !== 'closed'}
        onOpenChange={(o) => !o && setFormOpen({ mode: 'closed' })}
        title={formOpen.mode === 'edit' ? 'Edit budget' : 'New budget'}
      >
        {formOpen.mode !== 'closed' ? (
          <BudgetForm
            today={today as IsoDate}
            initial={
              formOpen.mode === 'edit'
                ? toBudgetFormInitial(formOpen.budget)
                : undefined
            }
            defaultCurrency={defaultCurrency}
            usedCurrencies={usedCurrencies}
            onDone={() => setFormOpen({ mode: 'closed' })}
            onCancel={() => setFormOpen({ mode: 'closed' })}
          />
        ) : null}
      </ResponsiveModal>

      <ResponsiveModal
        open={expenseOpen.mode !== 'closed'}
        onOpenChange={(o) => !o && setExpenseOpen({ mode: 'closed' })}
        title={expenseOpen.mode === 'edit' ? 'Edit expense' : 'New expense'}
      >
        {expenseOpen.mode !== 'closed' ? (
          <ExpenseForm
            budgets={budgetOptions}
            budgetId={expenseOpen.budgetId}
            initial={
              expenseOpen.mode === 'edit'
                ? toExpenseFormInitial(
                    expenseOpen.budgetId,
                    expenseOpen.expense,
                  )
                : undefined
            }
            usedCurrencies={usedCurrencies}
            onDone={() => setExpenseOpen({ mode: 'closed' })}
            onCancel={() => setExpenseOpen({ mode: 'closed' })}
          />
        ) : null}
      </ResponsiveModal>

      <ResponsiveModal
        open={confirmDeleteBudget != null}
        onOpenChange={(o) => !o && setConfirmDeleteBudget(null)}
        title="Delete budget?"
      >
        {confirmDeleteBudget ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">
              <strong className="text-ink">{confirmDeleteBudget.name}</strong>{' '}
              will be deleted
              {confirmDeleteBudget.expenses.length > 0 ? (
                <>
                  {' '}
                  along with its{' '}
                  <strong>{confirmDeleteBudget.expenses.length}</strong>{' '}
                  {confirmDeleteBudget.expenses.length === 1
                    ? 'expense'
                    : 'expenses'}
                  .
                </>
              ) : (
                '.'
              )}{' '}
              This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDeleteBudget(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={() => void runDeleteBudget(confirmDeleteBudget)}
              >
                Delete
              </Button>
            </div>
          </div>
        ) : null}
      </ResponsiveModal>

      <ResponsiveModal
        open={confirmDeleteExpense != null}
        onOpenChange={(o) => !o && setConfirmDeleteExpense(null)}
        title="Delete expense?"
      >
        {confirmDeleteExpense ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">
              <strong className="text-ink">
                {confirmDeleteExpense.expense.name}
              </strong>{' '}
              will be deleted. This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDeleteExpense(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={() =>
                  void runDeleteExpense(confirmDeleteExpense.expense)
                }
              >
                Delete
              </Button>
            </div>
          </div>
        ) : null}
      </ResponsiveModal>
    </div>
  );
}
