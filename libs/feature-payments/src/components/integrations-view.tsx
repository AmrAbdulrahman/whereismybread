'use client';

import { useMemo, useState } from 'react';
import type { Bank } from '@wib/db';
import { cn, MethodIcon } from '@wib/ui';
import type { RateMap } from '@wib/domain';
import type {
  BankConnectionView,
  BankTransactionRow,
} from '../lib/bank-sync-queries';
import type { BudgetSummary, PaymentsContext } from '../lib/types';
import { BankConnectionPanel } from './bank-connection-panel';
import { BankTransactionTriage } from './bank-transaction-triage';
import { StatementUpload } from './statement-upload';

const UNFILED = '__unfiled__';

/**
 * The Integrations page: one tab per bank. Each bank tab has its own CSV
 * upload and review inbox; the bank linked to the Open Banking connection
 * also shows the connect/status/settings panel. An "Unfiled" tab collects
 * any imported transactions not yet tied to a bank.
 */
export function IntegrationsView({
  banks,
  connection,
  bankConfigured,
  bankParam,
  pending,
  context,
  budgets,
  today,
  defaultCurrency,
  rates,
}: {
  banks: Bank[];
  connection: BankConnectionView | null;
  bankConfigured: boolean;
  bankParam?: string;
  pending: BankTransactionRow[];
  context: PaymentsContext;
  budgets: BudgetSummary[];
  today: string;
  defaultCurrency: string;
  rates: RateMap;
}) {
  const countByBank = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of pending) {
      const k = t.bankId ?? UNFILED;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [pending]);

  const hasUnfiled = (countByBank.get(UNFILED) ?? 0) > 0;

  const tabs = useMemo(() => {
    const list: { id: string; name: string; bank: Bank | null }[] = banks.map(
      (b) => ({ id: b.id, name: b.name, bank: b }),
    );
    if (hasUnfiled) list.push({ id: UNFILED, name: 'Unfiled', bank: null });
    return list;
  }, [banks, hasUnfiled]);

  const defaultTab =
    (connection?.bankId && banks.some((b) => b.id === connection.bankId)
      ? connection.bankId
      : tabs[0]?.id) ?? UNFILED;
  const [active, setActive] = useState(defaultTab);

  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0];
  const activeBankId = activeTab && activeTab.id !== UNFILED ? activeTab.id : null;

  const tabPending = pending.filter(
    (t) => (t.bankId ?? UNFILED) === (activeTab?.id ?? UNFILED),
  );

  const isConnectionTab =
    !!connection && !!activeBankId && connection.bankId === activeBankId;
  // With no connection at all, offer "Connect" on the first tab only.
  const offerConnect =
    !connection && bankConfigured && activeTab?.id === tabs[0]?.id;

  if (tabs.length === 0) {
    // No banks yet — a bare connect / upload surface.
    return (
      <div className="flex flex-col gap-5">
        {bankConfigured && (
          <BankConnectionPanel connection={null} configured={bankConfigured} />
        )}
        <StatementUpload defaultCurrency={defaultCurrency} />
        <BankTransactionTriage
          pending={pending}
          context={context}
          budgets={budgets}
          today={today}
          defaultCurrency={defaultCurrency}
          rates={rates}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const count = countByBank.get(t.id) ?? 0;
          const on = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                on
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line-strong text-ink-soft hover:text-ink',
              )}
            >
              {t.bank ? (
                t.bank.iconKey || t.bank.logoUrl ? (
                  <MethodIcon
                    iconKey={t.bank.iconKey ?? 'bank'}
                    logoUrl={t.bank.logoUrl}
                    size={14}
                  />
                ) : (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: t.bank.color }}
                  />
                )
              ) : null}
              {t.name}
              {count > 0 ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[11px] tabular-nums',
                    on ? 'bg-accent/20' : 'bg-surface-2 text-muted',
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {bankParam === 'connected' && isConnectionTab ? (
        <p className="rounded-lg border border-teal/40 bg-teal/5 px-3 py-2 text-sm text-teal">
          Bank connected. New transactions will appear below.
        </p>
      ) : bankParam === 'error' && (isConnectionTab || offerConnect) ? (
        <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-sm text-warn">
          Couldn&apos;t finish connecting. Try again from the panel below.
        </p>
      ) : null}

      {isConnectionTab ? (
        <BankConnectionPanel connection={connection} configured={bankConfigured} />
      ) : offerConnect ? (
        <BankConnectionPanel connection={null} configured={bankConfigured} />
      ) : null}

      {activeTab?.id !== UNFILED ? (
        <StatementUpload
          key={activeBankId ?? 'none'}
          defaultCurrency={defaultCurrency}
          bankId={activeBankId}
        />
      ) : null}

      <BankTransactionTriage
        key={activeTab?.id}
        pending={tabPending}
        context={context}
        budgets={budgets}
        today={today}
        defaultCurrency={defaultCurrency}
        rates={rates}
      />
    </div>
  );
}
