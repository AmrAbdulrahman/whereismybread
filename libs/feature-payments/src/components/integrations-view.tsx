'use client';

import { useMemo, useState } from 'react';
import type { Bank } from '@wib/db';
import { cn, MethodIcon } from '@wib/ui';
import type { RateMap } from '@wib/domain';
import type {
  BankConnectionView,
  BankTransactionRow,
  ConnectableBankOption,
} from '../lib/bank-sync-queries';
import { connectableForBankName } from '../lib/connectable-banks';
import type { BudgetSummary, PaymentsContext } from '../lib/types';
import { BankConnectionPanel } from './bank-connection-panel';
import { BankTransactionTriage } from './bank-transaction-triage';
import { StatementUpload } from './statement-upload';

const UNFILED = '__unfiled__';

/**
 * The Integrations page: one tab per bank. Each bank tab has its own CSV
 * upload and review inbox; a bank that can be linked via Open Banking also
 * shows the connect / status / settings panel. An "Unfiled" tab collects
 * imported transactions not yet tied to a bank.
 */
export function IntegrationsView({
  banks,
  connections,
  connectable,
  bankParam,
  pending,
  context,
  budgets,
  today,
  defaultCurrency,
  rates,
}: {
  banks: Bank[];
  connections: BankConnectionView[];
  connectable: ConnectableBankOption[];
  bankParam?: string;
  pending: BankTransactionRow[];
  context: PaymentsContext;
  budgets: BudgetSummary[];
  today: string;
  defaultCurrency: string;
  rates: RateMap;
}) {
  const connByBankId = useMemo(() => {
    const m = new Map<string, BankConnectionView>();
    for (const c of connections) if (c.bankId) m.set(c.bankId, c);
    return m;
  }, [connections]);

  /** Catalog entry available for this bank name, if any. */
  const connectableFor = (name: string): ConnectableBankOption | null => {
    const entry = connectableForBankName(name);
    if (!entry) return null;
    return connectable.find((c) => c.key === entry.key) ?? null;
  };

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
    const list: {
      id: string;
      name: string;
      bank: Bank | null;
      connectOnly?: ConnectableBankOption;
    }[] = banks.map((b) => ({ id: b.id, name: b.name, bank: b }));
    // A connectable bank the user hasn't set up yet gets a connect-only tab.
    for (const c of connectable) {
      if (!banks.some((b) => connectableForBankName(b.name)?.key === c.key)) {
        list.push({ id: `connect:${c.key}`, name: c.label, bank: null, connectOnly: c });
      }
    }
    if (hasUnfiled) list.push({ id: UNFILED, name: 'Unfiled', bank: null });
    return list;
  }, [banks, connectable, hasUnfiled]);

  const defaultTab =
    connections.find((c) => c.bankId && banks.some((b) => b.id === c.bankId))
      ?.bankId ??
    tabs[0]?.id ??
    UNFILED;
  const [active, setActive] = useState(defaultTab);

  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0];
  const isConnectOnly = !!activeTab?.connectOnly;
  const isUnfiled = activeTab?.id === UNFILED;
  const activeBankId =
    activeTab && !isUnfiled && !isConnectOnly ? activeTab.id : null;

  const tabPending = isConnectOnly
    ? []
    : pending.filter(
        (t) => (t.bankId ?? UNFILED) === (activeTab?.id ?? UNFILED),
      );

  const activeConnection = activeBankId
    ? (connByBankId.get(activeBankId) ?? null)
    : null;
  const activeConnectable =
    activeTab?.connectOnly ??
    (activeTab && activeTab.name && !isUnfiled
      ? connectableFor(activeTab.name)
      : null);
  const showPanel = !!activeConnection || !!activeConnectable;

  if (tabs.length === 0) {
    // No banks yet — one connectable card per catalog bank + a bare upload.
    return (
      <div className="flex flex-col gap-5">
        {connectable.map((c) => (
          <BankConnectionPanel key={c.key} connection={null} connectable={c} />
        ))}
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
          const linked = t.bank ? connByBankId.has(t.bank.id) : false;
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
              {linked ? (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-teal"
                  title="Connected"
                />
              ) : null}
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

      {bankParam === 'connected' && activeConnection ? (
        <p className="rounded-lg border border-teal/40 bg-teal/5 px-3 py-2 text-sm text-teal">
          Bank connected. New transactions will appear below.
        </p>
      ) : bankParam === 'error' && showPanel ? (
        <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-sm text-warn">
          Couldn&apos;t finish connecting. Try again from the panel below.
        </p>
      ) : null}

      {showPanel ? (
        <BankConnectionPanel
          key={`panel:${activeTab?.id}`}
          connection={activeConnection}
          connectable={activeConnection ? null : activeConnectable}
        />
      ) : null}

      {isConnectOnly ? (
        <p className="text-sm text-ink-soft">
          Connect {activeTab?.name} above, or add it as a bank first to upload
          statements.
        </p>
      ) : (
        <>
          {!isUnfiled ? (
            <StatementUpload
              key={`upload:${activeBankId ?? 'none'}`}
              defaultCurrency={defaultCurrency}
              bankId={activeBankId}
            />
          ) : null}

          <BankTransactionTriage
            key={`triage:${activeTab?.id ?? UNFILED}`}
            pending={tabPending}
            context={context}
            budgets={budgets}
            today={today}
            defaultCurrency={defaultCurrency}
            rates={rates}
          />
        </>
      )}
    </div>
  );
}
