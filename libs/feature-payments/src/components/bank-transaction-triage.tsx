'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { RateMap } from '@wib/domain';
import { Button } from '@wib/ui';
import {
  bulkIgnoreBankTransactionsAction,
  categorizeBankTransactionAction,
  ignoreBankTransactionAction,
} from '../lib/bank-transaction-actions';
import type { BankTransactionRow as BankTransactionRowData } from '../lib/bank-sync-queries';
import type { BudgetSummary, PaymentsContext } from '../lib/types';
import { BankTransactionRow } from './bank-transaction-row';
import {
  TransactionTriageModal,
  type TriageSheet,
} from './transaction-triage-modal';

/**
 * The review inbox: uncategorized imported transactions, most recent first.
 * Rows leave the list the instant an action is taken. Rows can be
 * multi-selected for a bulk ignore.
 */
export function BankTransactionTriage({
  pending,
  context,
  budgets,
  today,
  defaultCurrency,
  rates,
}: {
  pending: BankTransactionRowData[];
  context: PaymentsContext;
  budgets: BudgetSummary[];
  today: string;
  defaultCurrency: string;
  rates: RateMap;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const live = new Set(pending.map((t) => t.id));
    setHandled((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [pending]);

  const [sheet, setSheet] = useState<TriageSheet>({ mode: 'closed' });
  const close = () => setSheet({ mode: 'closed' });

  const visible = useMemo(
    () => pending.filter((t) => !handled.has(t.id)),
    [pending, handled],
  );

  const settle = (ids: string[], run: () => Promise<unknown>) => {
    setHandled((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
    startTransition(async () => {
      await run();
      router.refresh();
    });
  };

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const allSelected =
    visible.length > 0 && visible.every((t) => selected.has(t.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(visible.map((t) => t.id)));

  const bulkIgnore = () => {
    const ids = [...selected];
    if (ids.length > 0)
      settle(ids, () => bulkIgnoreBankTransactionsAction(ids));
  };

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong py-12 text-center text-sm text-ink-soft">
        Nothing to review. Upload a statement or sync to pull in new
        transactions.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-ink">
          Needs review ({visible.length})
        </h2>
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs font-medium text-ink-soft hover:text-ink"
        >
          {allSelected ? 'Clear selection' : 'Select all'}
        </button>
      </div>

      {selected.size > 0 ? (
        <div className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm backdrop-blur">
          <span className="font-medium text-ink">
            {selected.size} selected
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
            <Button type="button" size="sm" onClick={bulkIgnore}>
              Ignore {selected.size}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {visible.map((txn) => (
          <BankTransactionRow
            key={txn.id}
            txn={txn}
            selectable
            selected={selected.has(txn.id)}
            onSelectedChange={(on) => toggle(txn.id, on)}
            onLogExpense={() => setSheet({ mode: 'expense', txn })}
            onCreatePayment={() => setSheet({ mode: 'payment', txn })}
            onIgnore={() =>
              settle([txn.id], () => ignoreBankTransactionAction(txn.id))
            }
          />
        ))}
      </div>

      <TransactionTriageModal
        sheet={sheet}
        context={context}
        budgets={budgets}
        today={today}
        defaultCurrency={defaultCurrency}
        rates={rates}
        onClose={close}
        onExpenseDone={(txnId, expense) => {
          close();
          settle([txnId], () =>
            categorizeBankTransactionAction(txnId, {
              type: 'expense',
              id: expense.id,
            }),
          );
        }}
        onPaymentDone={(txnId, payment) => {
          close();
          if (payment) {
            settle([txnId], () =>
              categorizeBankTransactionAction(txnId, {
                type: 'payment',
                id: payment.id,
              }),
            );
          }
        }}
      />
    </div>
  );
}
