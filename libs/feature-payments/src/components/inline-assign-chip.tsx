'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@wib/ui';
import { Plus } from '@wib/ui/icons';
import type { BudgetSummary } from '../lib/types';

export interface AssignOption {
  id: string;
  name: string;
  color: string;
}

/**
 * Non-closed budgets as pick options, de-duplicated by name (a recurring
 * monthly budget has one row per month — keep the most recent). The payment /
 * expense stores that row's id; the chip only ever shows its name + colour.
 */
export function budgetAssignOptions(budgets: BudgetSummary[]): AssignOption[] {
  const byName = new Map<string, BudgetSummary>();
  for (const b of budgets) {
    if (b.closedAt) continue;
    const key = b.name.toLowerCase();
    const seen = byName.get(key);
    if (!seen || b.startDate > seen.startDate) byName.set(key, b);
  }
  return [...byName.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((b) => ({ id: b.id, name: b.name, color: b.color }));
}

/**
 * A light dashed "+ account" / "+ budget" pill for a plan card that has none.
 * Clicking opens a small menu to assign one inline — no edit modal. Renders
 * nothing when there are no options to pick.
 */
export function InlineAssignChip({
  label,
  options,
  onPick,
}: {
  /** The noun — the chip reads "+ {label}". */
  label: string;
  options: AssignOption[];
  onPick: (id: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (options.length === 0) return null;

  const pick = async (id: string) => {
    setOpen(false);
    setBusy(true);
    try {
      await onPick(id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Assign ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          'inline-flex items-center gap-0.5 rounded-full border border-dashed border-line-strong px-1.5 py-0.5 text-[10px] font-medium text-muted transition-colors hover:border-accent/60 hover:text-ink',
          (busy || open) && 'border-accent/60 text-ink',
        )}
      >
        <Plus size={10} strokeWidth={2.75} />
        {label}
      </button>
      {open ? (
        <span
          role="listbox"
          className="absolute left-0 top-full z-20 mt-1 max-h-56 min-w-[9rem] overflow-auto rounded-lg border border-line-strong bg-surface p-1 shadow-lg"
        >
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={(e) => {
                e.stopPropagation();
                void pick(o.id);
              }}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-2"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: o.color }}
              />
              <span className="truncate">{o.name}</span>
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
