'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatMoney, money, type RateMap } from '@wib/domain';
import { ResponsiveModal, cn } from '@wib/ui';
import { ChevronDown } from '@wib/ui/icons';
import type { PaymentOverrides } from '@wib/db';
import type {
  ChecklistMonth,
  EditablePayment,
  PaymentsContext,
} from '../lib/types';
import { OccurrenceItem } from './occurrence-item';
import { PaymentForm } from './payment-form';
import { applyOverride } from './payments-view';

export function ChecklistView({
  months,
  currentMonthKey,
  today,
  displayCurrency,
  defaultCurrency,
  rates,
  empty,
  context,
  editable,
  overrides,
}: {
  months: ChecklistMonth[];
  currentMonthKey: string;
  today: string;
  displayCurrency: string;
  defaultCurrency: string;
  rates: RateMap;
  empty: boolean;
  context: PaymentsContext;
  editable: Record<string, EditablePayment>;
  overrides: Record<string, PaymentOverrides>;
}) {
  // Only the current month is open to start; keep the user's choices across the
  // server re-render that follows ticking a box.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set([currentMonthKey]),
  );
  useEffect(() => {
    setOpen((prev) => (prev.size === 0 ? new Set([currentMonthKey]) : prev));
  }, [currentMonthKey]);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const [sheet, setSheet] = useState<
    | { mode: 'closed' }
    | { mode: 'edit'; payment: EditablePayment; occurrenceDate: string; hasOverride: boolean }
  >({ mode: 'closed' });
  const close = () => setSheet({ mode: 'closed' });
  const openEdit = (paymentId: string, occurrenceDate: string) => {
    const base = editable[paymentId];
    if (!base) return;
    const ov = overrides[`${paymentId}:${occurrenceDate}`];
    setSheet({
      mode: 'edit',
      payment: ov ? applyOverride(base, ov) : base,
      occurrenceDate,
      hasOverride: ov != null,
    });
  };
  const usedCurrencies = [
    ...new Set([displayCurrency, defaultCurrency]),
  ];

  const current = useMemo(
    () => months.find((m) => m.key === currentMonthKey),
    [months, currentMonthKey],
  );
  const behind = useMemo(
    () =>
      months
        .filter((m) => m.isPast && m.remainingMinor > 0)
        .reduce((n, m) => n + (m.totalCount - m.doneCount), 0),
    [months],
  );

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Manual transfers</h1>
        <p className="text-ink-soft">
          A month-by-month checklist of the transfers you send by hand. Direct
          debits, card payments and cash aren&rsquo;t here.
        </p>
        {!empty ? (
          <p className="mt-1 text-sm">
            {current && current.totalCount > 0 ? (
              <span className="font-medium text-ink">
                {current.totalCount - current.doneCount} left to send this month
              </span>
            ) : (
              <span className="text-muted">Nothing to send this month.</span>
            )}
            {behind > 0 ? (
              <span className="text-danger">
                {' · '}
                {behind} still unpaid from earlier months
              </span>
            ) : null}
          </p>
        ) : null}
      </header>

      {empty ? (
        <div className="rounded-xl border border-dashed border-line-strong py-12 text-center text-sm text-ink-soft">
          No manual transfers yet. Payments whose method is “Manual transfer”
          show up here.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {months.map((m) => {
            const isOpen = open.has(m.key);
            const remaining = money(m.remainingMinor, displayCurrency);
            const allDone = m.totalCount > 0 && m.doneCount === m.totalCount;
            return (
              <section
                key={m.key}
                className={cn(
                  'overflow-hidden rounded-xl border',
                  m.isCurrent ? 'border-accent/50' : 'border-line',
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(m.key)}
                  aria-expanded={isOpen}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                    m.isCurrent ? 'bg-accent/5' : 'hover:bg-surface-2',
                  )}
                >
                  <ChevronDown
                    size={16}
                    strokeWidth={2.5}
                    className={cn(
                      'shrink-0 text-muted transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate font-display text-sm font-semibold text-ink">
                      {m.label}
                    </span>
                    {m.isCurrent ? (
                      <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-fg">
                        This month
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    {m.totalCount === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <>
                        <span
                          className={cn(
                            'font-medium',
                            allDone ? 'text-good' : 'text-muted',
                          )}
                        >
                          {m.doneCount}/{m.totalCount} done
                        </span>
                        {m.remainingMinor > 0 ? (
                          <span
                            className={cn(
                              'ml-2 font-mono tabular-nums',
                              m.isPast ? 'text-danger' : 'text-ink-soft',
                            )}
                          >
                            {formatMoney(remaining)}
                          </span>
                        ) : null}
                      </>
                    )}
                  </span>
                </button>

                {isOpen ? (
                  <div className="flex flex-col gap-1.5 border-t border-line bg-ground px-3 py-3">
                    {m.occurrences.length === 0 ? (
                      <p className="py-2 text-center text-sm text-muted">
                        Nothing to send this month.
                      </p>
                    ) : (
                      m.occurrences.map((occ) => (
                        <OccurrenceItem
                          key={occ.key}
                          occ={occ}
                          onEdit={openEdit}
                          displayCurrency={displayCurrency}
                          rates={rates}
                          today={today}
                        />
                      ))
                    )}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      <ResponsiveModal
        open={sheet.mode !== 'closed'}
        onOpenChange={(o) => !o && close()}
        title="Edit payment"
      >
        {sheet.mode !== 'closed' ? (
          <PaymentForm
            methods={context.methods}
            accounts={context.accounts}
            banks={context.banks}
            recipientMethods={context.recipientMethods}
            tags={context.tags}
            defaultCurrency={defaultCurrency}
            today={today}
            usedCurrencies={usedCurrencies}
            rates={rates}
            initial={sheet.payment}
            occurrenceDate={sheet.occurrenceDate}
            hasOverride={sheet.hasOverride}
            onDone={close}
          />
        ) : null}
      </ResponsiveModal>
    </div>
  );
}
