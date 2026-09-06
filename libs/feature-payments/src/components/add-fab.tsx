'use client';

import { useState } from 'react';
import { cn } from '@wib/ui';
import { CalendarDays, PiggyBank, Plus, Receipt } from '@wib/ui/icons';

/**
 * One floating "+" that expands into the three add actions, so the header
 * doesn't have to carry them. Bottom-right above the mobile tab bar
 * (expands up); top-right corner on desktop (expands down).
 */
export function AddFab({
  onAddPayment,
  onAddExpense,
  onAddBudget,
}: {
  onAddPayment: () => void;
  onAddExpense: () => void;
  onAddBudget: () => void;
}) {
  const [open, setOpen] = useState(false);

  const items = [
    { icon: CalendarDays, label: 'Planned payment', run: onAddPayment },
    { icon: Receipt, label: 'Expense', run: onAddExpense },
    { icon: PiggyBank, label: 'Budget', run: onAddBudget },
  ];

  return (
    <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2.5 lg:bottom-auto lg:right-5 lg:top-3 lg:flex-col-reverse">
      {open ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 -z-10 cursor-default bg-ground/50 backdrop-blur-[1px]"
          />
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => {
                setOpen(false);
                it.run();
              }}
              className="flex items-center gap-2 rounded-full border border-line bg-surface py-2 pl-3 pr-4 text-sm font-medium text-ink shadow-md"
            >
              <it.icon size={16} strokeWidth={2} className="text-accent" />
              {it.label}
            </button>
          ))}
        </>
      ) : null}
      <button
        type="button"
        aria-label={open ? 'Close add menu' : 'Add'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-fg shadow-lg transition-transform active:scale-95"
      >
        <Plus
          size={24}
          strokeWidth={2.5}
          className={cn('transition-transform', open && 'rotate-45')}
        />
      </button>
    </div>
  );
}
