'use client';

import { useMemo, useState } from 'react';
import {
  addDays,
  daysInMonth,
  formatConverted,
  money,
  startOfMonth,
  weekdayMonday0,
  type IsoDate,
} from '@wib/domain';
import { cn } from '@wib/ui';
import { dueAlertFor } from '../lib/due-alert';
import type { BoardOccurrence, PaymentBoard } from '../lib/types';
import { OccurrenceItem } from './occurrence-item';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** ‼️ overdue · ❗️ due today · ⚠️ due soon — for still-unpaid manual payments. */
const DUE_EMOJI = { overdue: '‼️', today: '❗️', soon: '⚠️' } as const;
function dueAlertIcon(occ: BoardOccurrence, today: IsoDate): string {
  const alert = dueAlertFor(occ, today);
  return alert ? `${DUE_EMOJI[alert.level]} ` : '';
}

function monthLabel(month: IsoDate) {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}T00:00:00Z`));
}

export function PaymentCalendar({
  board,
  month,
  onMonthChange,
  onEdit,
  onFlag,
}: {
  board: PaymentBoard;
  month: IsoDate; // first of month
  onMonthChange: (month: IsoDate) => void;
  onEdit: (paymentId: string, dueDate: string) => void;
  onFlag: (paymentId: string, dueDate: string) => void;
}) {
  const [selected, setSelected] = useState<IsoDate | null>(board.today);

  const byDate = useMemo(() => {
    const map = new Map<string, BoardOccurrence[]>();
    for (const occ of board.occurrences) {
      const list = map.get(occ.dueDate);
      if (list) list.push(occ);
      else map.set(occ.dueDate, [occ]);
    }
    return map;
  }, [board.occurrences]);

  const start = startOfMonth(month);
  const leadingBlanks = weekdayMonday0(start);
  const total = daysInMonth(start);
  const cells: (IsoDate | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: total }, (_, i) => addDays(start, i)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftMonth = (delta: number) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + delta);
    onMonthChange(`${d.toISOString().slice(0, 7)}-01`);
    setSelected(null);
  };

  const thisMonth = startOfMonth(board.today);
  const onThisMonth = start === thisMonth;

  const selectedOccurrences = selected ? (byDate.get(selected) ?? []) : [];

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate font-display text-lg font-semibold">
            {monthLabel(start)}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onMonthChange(thisMonth);
                setSelected(board.today);
              }}
              disabled={onThisMonth}
              className="rounded-md border border-line-strong px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:text-ink disabled:opacity-40 disabled:hover:text-muted"
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
              className="grid h-7 w-7 place-items-center rounded-md border border-line-strong text-muted hover:text-ink"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
              className="grid h-7 w-7 place-items-center rounded-md border border-line-strong text-muted hover:text-ink"
            >
              ›
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wide text-muted">
          {WEEKDAYS.map((d) => (
            <span key={d} className="px-1 py-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date)
              return <div key={`b${i}`} className="min-h-16 rounded-md" />;
            const dayOccs = byDate.get(date) ?? [];
            const isToday = date === board.today;
            return (
              <button
                key={date}
                type="button"
                aria-current={isToday ? 'date' : undefined}
                onClick={() => setSelected(date)}
                className={cn(
                  'flex min-h-16 flex-col items-start gap-1 rounded-md border p-1 text-left transition-colors',
                  selected === date
                    ? 'border-accent'
                    : isToday
                      ? 'border-accent/40 bg-accent/5'
                      : 'border-line hover:border-line-strong',
                )}
              >
                <span
                  className={cn(
                    'grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-semibold tabular-nums',
                    isToday
                      ? 'bg-accent text-accent-fg'
                      : 'font-medium text-muted',
                  )}
                >
                  {Number(date.slice(8, 10))}
                </span>
                <div className="flex w-full flex-col gap-0.5">
                  {dayOccs.slice(0, 3).map((occ) => (
                    <span
                      key={occ.key}
                      className="truncate rounded px-1 text-[10px] leading-tight"
                      style={{
                        background: `${occ.method?.color ?? '#6321d6'}22`,
                        color: occ.method?.color ?? '#6321d6',
                        borderLeft: `2px ${occ.isOneTime ? 'dashed' : 'solid'} ${occ.method?.color ?? '#6321d6'}`,
                        textDecoration:
                          occ.status === 'paid' || occ.status === 'skipped'
                            ? 'line-through'
                            : undefined,
                        opacity: occ.status === 'skipped' ? 0.55 : undefined,
                      }}
                    >
                      {occ.instanceFlagNote || occ.seriesFlagNote ? '🚩 ' : ''}
                      {dueAlertIcon(occ, board.today)}
                      {occ.name}
                    </span>
                  ))}
                  {dayOccs.length > 3 ? (
                    <span className="px-1 text-[10px] text-muted">
                      +{dayOccs.length - 3}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="min-w-0 lg:w-80 lg:shrink-0">
        {selected ? (
          <div className="flex flex-col gap-3">
            <div className="font-display text-sm font-semibold">
              {new Intl.DateTimeFormat('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                timeZone: 'UTC',
              }).format(new Date(`${selected}T00:00:00Z`))}
            </div>
            {selectedOccurrences.length === 0 ? (
              <p className="text-sm text-muted">Nothing due.</p>
            ) : (
              <>
                {selectedOccurrences.map((occ) => (
                  <OccurrenceItem
                    key={occ.key}
                    occ={occ}
                    onEdit={onEdit}
                    onFlag={onFlag}
                    displayCurrency={board.displayCurrency}
                    rates={board.rates}
                    today={board.today}
                    compact
                  />
                ))}
                <div className="flex justify-between border-t border-line pt-2 text-xs text-muted">
                  <span>Day total</span>
                  <span className="font-mono tabular-nums">
                    {formatConverted(
                      money(
                        selectedOccurrences
                          .filter((o) => o.status !== 'skipped')
                          .reduce((s, o) => s + o.amount.minorUnits, 0),
                        selectedOccurrences[0]?.amount.currency ??
                          board.summary.currency,
                      ),
                      board.displayCurrency,
                      board.rates,
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">
            Pick a day to see what&rsquo;s due.
          </p>
        )}
      </aside>
    </div>
  );
}
