'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney, money, type RateMap } from '@wib/domain';
import { Button, ResponsiveModal } from '@wib/ui';
import { Search, X } from '@wib/ui/icons';
import {
  AutomationForm,
  type AutomationFormInitial,
} from '@wib/feature-automations';
import {
  bulkIgnoreBankTransactionsAction,
  categorizeBankTransactionAction,
  ignoreBankTransactionAction,
} from '../lib/bank-transaction-actions';
import {
  automationDraftFor,
  buildAutomationLookups,
} from '../lib/automation-lookups';
import type { BankTransactionRow as BankTransactionRowData } from '../lib/bank-sync-queries';
import type { BudgetSummary, PaymentsContext } from '../lib/types';
import { BankTransactionRow } from './bank-transaction-row';
import { EnrichTransactionModal } from './enrich-transaction-modal';
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
  const [enrichId, setEnrichId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const automationLookups = useMemo(
    () =>
      buildAutomationLookups({
        accounts: context.accounts,
        banks: context.banks,
        methods: context.methods,
        tags: context.tags,
        budgets,
      }),
    [context, budgets],
  );
  const [automationDraft, setAutomationDraft] =
    useState<AutomationFormInitial | null>(null);

  const unhandled = useMemo(
    () => pending.filter((t) => !handled.has(t.id)),
    [pending, handled],
  );

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!q) return unhandled;
    return unhandled.filter((t) => {
      const amount = formatMoney(money(t.amountMinor, t.currency)).toLowerCase();
      return (
        t.merchant.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.balanceName ?? '').toLowerCase().includes(q) ||
        amount.includes(q)
      );
    });
  }, [unhandled, q]);

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

  if (unhandled.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong py-12 text-center text-sm text-ink-soft">
        Nothing to review. Upload a statement or sync to pull in new
        transactions.
      </div>
    );
  }

  const showSearch = unhandled.length > 5 || q.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-ink">
          Needs review ({q ? `${visible.length} of ${unhandled.length}` : visible.length})
        </h2>
        <button
          type="button"
          onClick={toggleAll}
          disabled={visible.length === 0}
          className="text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-40"
        >
          {allSelected ? 'Clear selection' : 'Select all'}
        </button>
      </div>

      {showSearch ? (
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search description, amount…"
            className="h-9 w-full rounded-md border border-line-strong bg-ground pl-9 pr-8 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      ) : null}

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

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong py-8 text-center text-sm text-ink-soft">
          No transactions match &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : (
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
              onEdit={() => setEnrichId(txn.id)}
              onOpenDetails={() => setEnrichId(txn.id)}
              onCreateAutomation={() =>
                setAutomationDraft(
                  automationDraftFor(
                    txn.displayName || txn.merchant || txn.description,
                    txn.amountMinor,
                  ),
                )
              }
              onIgnore={() =>
                settle([txn.id], () => ignoreBankTransactionAction(txn.id))
              }
            />
          ))}
        </div>
      )}

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

      <EnrichTransactionModal
        open={enrichId != null}
        onOpenChange={(o) => !o && setEnrichId(null)}
        txn={unhandled.find((t) => t.id === enrichId) ?? null}
        accounts={context.accounts}
        methods={context.methods}
        tags={context.tags}
        providers={context.providers}
        onDone={() => {
          setEnrichId(null);
          startTransition(() => router.refresh());
        }}
      />

      <ResponsiveModal
        open={automationDraft != null}
        onOpenChange={(o) => !o && setAutomationDraft(null)}
        title="New automation"
      >
        {automationDraft ? (
          <AutomationForm
            initial={automationDraft}
            lookups={automationLookups}
            hideTrigger
            onDone={() => {
              setAutomationDraft(null);
              startTransition(() => router.refresh());
            }}
            onCancel={() => setAutomationDraft(null)}
          />
        ) : null}
      </ResponsiveModal>
    </div>
  );
}
