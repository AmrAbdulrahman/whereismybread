'use client';

import type { Expense, Payment } from '@wib/db';
import { formatMoney, money, type RateMap } from '@wib/domain';
import { ResponsiveModal } from '@wib/ui';
import type { BankTransactionRow as BankTransactionRowData } from '../lib/bank-sync-queries';
import type { BudgetSummary, PaymentsContext } from '../lib/types';
import { ExpenseForm } from './expense-form';
import { PaymentForm } from './payment-form';

export type TriageSheet =
  | { mode: 'closed' }
  | { mode: 'expense'; txn: BankTransactionRowData }
  | { mode: 'payment'; txn: BankTransactionRowData };

function toAmountString(amountMinor: number): string {
  return (Math.abs(amountMinor) / 100).toFixed(2);
}

function whenLabel(iso: string, hasTime: boolean): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  if (!hasTime) return date;
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  return `${date} · ${time}`;
}

/** The raw source transaction, shown read-only above the form. */
function SourcePreview({ txn }: { txn: BankTransactionRowData }) {
  const negative = txn.amountMinor < 0;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted">{whenLabel(txn.occurredAt, txn.hasTime)}</span>
        <span
          className={`font-mono font-semibold tabular-nums ${negative ? 'text-ink' : 'text-good'}`}
        >
          {negative ? '' : '+'}
          {formatMoney(money(txn.amountMinor, txn.currency))}
        </span>
      </div>
      <p className="text-ink-soft">{txn.description}</p>
      {txn.balanceName ? (
        <p className="text-muted">{txn.balanceName}</p>
      ) : null}
    </div>
  );
}

/**
 * The "log this transaction as an expense / turn it into a payment" modal,
 * shared by the Sync-bank inbox and the plan list's per-day review rows.
 * The parent owns the `sheet` state and reconciles its own list after
 * `onExpenseDone` / `onPaymentDone`.
 */
export function TransactionTriageModal({
  sheet,
  context,
  budgets,
  today,
  defaultCurrency,
  rates,
  onClose,
  onExpenseDone,
  onPaymentDone,
}: {
  sheet: TriageSheet;
  context: PaymentsContext;
  budgets: BudgetSummary[];
  today: string;
  defaultCurrency: string;
  rates: RateMap;
  onClose: () => void;
  onExpenseDone: (txnId: string, expense: Expense) => void;
  onPaymentDone: (txnId: string, payment: Payment | undefined) => void;
}) {
  const budgetOptions = budgets.map((b) => ({
    id: b.id,
    name: b.name,
    currency: b.limit.currency,
    startDate: b.startDate,
  }));

  const txn = sheet.mode === 'closed' ? null : sheet.txn;

  return (
    <ResponsiveModal
      open={sheet.mode !== 'closed'}
      onOpenChange={(o) => !o && onClose()}
      title={sheet.mode === 'payment' ? 'New payment' : 'New expense'}
    >
      {txn ? (
        <div className="flex flex-col gap-4">
          <SourcePreview txn={txn} />
          {sheet.mode === 'expense' ? (
            <ExpenseForm
              budgets={budgetOptions}
              accounts={context.accounts}
              banks={context.banks}
              tags={context.tags}
              date={txn.occurredAt.slice(0, 10)}
              prefill={{
                name: txn.merchant || txn.description,
                amount: toAmountString(txn.amountMinor),
                currency: txn.currency,
                notes: txn.description,
                bankId: txn.bankId,
              }}
              onDone={(expense) => onExpenseDone(txn.id, expense)}
              onCancel={onClose}
            />
          ) : (
            <PaymentForm
              methods={context.methods}
              accounts={context.accounts}
              banks={context.banks}
              recipientMethods={context.recipientMethods}
              tags={context.tags}
              defaultCurrency={defaultCurrency}
              today={today}
              rates={rates}
              prefill={{
                name: txn.merchant || txn.description,
                amount: toAmountString(txn.amountMinor),
                currency: txn.currency,
                notes: txn.description,
                bankId: txn.bankId,
                date: txn.occurredAt.slice(0, 10),
              }}
              onDone={(payment) => onPaymentDone(txn.id, payment)}
            />
          )}
        </div>
      ) : null}
    </ResponsiveModal>
  );
}
