'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatMoney, money, type RateMap } from '@wib/domain';
import { cn } from '@wib/ui';
import { ChevronDown } from '@wib/ui/icons';
import type { ChecklistMonth } from '../lib/types';
import { OccurrenceItem } from './occurrence-item';

export function ChecklistView({
  months,
  currentMonthKey,
  today,
  displayCurrency,
  rates,
  empty,
}: {
  months: ChecklistMonth[];
  currentMonthKey: string;
  today: string;
  displayCurrency: string;
  rates: RateMap;
  empty: boolean;
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
        <h1 className="text-2xl font-semibold">Manual payments</h1>
        <p className="text-ink-soft">
          A month-by-month checklist of the payments you send yourself — cash and
          manual transfers. Direct debits and card payments aren&rsquo;t here;
          they collect on their own.
        </p>
        {!empty ? (
          <p className="mt-1 text-sm">
            {current && current.totalCount > 0 ? (
              <span className="font-medium text-ink">
                {current.totalCount - current.doneCount} left to pay this month
              </span>
            ) : (
              <span className="text-muted">Nothing to pay yourself this month.</span>
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
          No manual payments yet. Anything you pay by cash or manual transfer
          shows up here.
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
                        Nothing to pay yourself this month.
                      </p>
                    ) : (
                      m.occurrences.map((occ) => (
                        <OccurrenceItem
                          key={occ.key}
                          occ={occ}
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
    </div>
  );
}
