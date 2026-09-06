'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { RateMap } from '@wib/domain';
import {
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
 * The Sync-bank inbox: uncategorized imported transactions, most recent
 * first. Rows leave the list the instant an action is taken — the server
 * call + refetch reconcile in the background.
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

  useEffect(() => {
    setHandled((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(pending.map((t) => t.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [pending]);

  const [sheet, setSheet] = useState<TriageSheet>({ mode: 'closed' });
  const close = () => setSheet({ mode: 'closed' });

  const settle = (id: string, run: () => Promise<unknown>) => {
    setHandled((prev) => new Set(prev).add(id));
    startTransition(async () => {
      await run();
      router.refresh();
    });
  };

  const visible = pending.filter((t) => !handled.has(t.id));

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong py-12 text-center text-sm text-ink-soft">
        Nothing to review. Upload a statement above to pull in new
        transactions.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-base font-semibold text-ink">
        Needs review ({visible.length})
      </h2>
      <div className="flex flex-col gap-2">
        {visible.map((txn) => (
          <BankTransactionRow
            key={txn.id}
            txn={txn}
            onLogExpense={() => setSheet({ mode: 'expense', txn })}
            onCreatePayment={() => setSheet({ mode: 'payment', txn })}
            onIgnore={() =>
              settle(txn.id, () => ignoreBankTransactionAction(txn.id))
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
          settle(txnId, () =>
            categorizeBankTransactionAction(txnId, {
              type: 'expense',
              id: expense.id,
            }),
          );
        }}
        onPaymentDone={(txnId, payment) => {
          close();
          if (payment) {
            settle(txnId, () =>
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
