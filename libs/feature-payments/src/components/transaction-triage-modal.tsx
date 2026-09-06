'use client';

import type { Expense, Payment } from '@wib/db';
import type { RateMap } from '@wib/domain';
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

  return (
    <ResponsiveModal
      open={sheet.mode !== 'closed'}
      onOpenChange={(o) => !o && onClose()}
      title={sheet.mode === 'payment' ? 'New payment' : 'New expense'}
    >
      {sheet.mode === 'expense' ? (
        <ExpenseForm
          budgets={budgetOptions}
          accounts={context.accounts}
          tags={context.tags}
          date={sheet.txn.occurredAt.slice(0, 10)}
          prefill={{
            name: sheet.txn.description,
            amount: toAmountString(sheet.txn.amountMinor),
            currency: sheet.txn.currency,
          }}
          onDone={(expense) => onExpenseDone(sheet.txn.id, expense)}
          onCancel={onClose}
        />
      ) : sheet.mode === 'payment' ? (
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
            name: sheet.txn.description,
            amount: toAmountString(sheet.txn.amountMinor),
            currency: sheet.txn.currency,
          }}
          onDone={(payment) => onPaymentDone(sheet.txn.id, payment)}
        />
      ) : null}
    </ResponsiveModal>
  );
}
