'use client';

import { useState } from 'react';
import type { Account, Bank, PaymentMethod, Tag } from '@wib/db';
import { cn, Input } from '@wib/ui';
import { Search, X } from '@wib/ui/icons';

/** Which kinds of list rows to show. Empty array means "all of them". */
export type ListKind = 'planned' | 'budgeted' | 'unbudgeted';

const KIND_LABELS: Record<ListKind, string> = {
  planned: 'Planned',
  budgeted: 'Budgeted',
  unbudgeted: 'Expenses (no budget)',
};

export interface ListFilterValue {
  /** Free text — matched against description, notes and provider link. */
  search: string;
  accountIds: string[];
  bankIds: string[];
  tagIds: string[];
  methodIds: string[];
  kinds: ListKind[];
}

export const EMPTY_LIST_FILTER: ListFilterValue = {
  search: '',
  accountIds: [],
  bankIds: [],
  tagIds: [],
  methodIds: [],
  kinds: [],
};

export function listFilterCount(v: ListFilterValue): number {
  return (
    (v.search.trim() ? 1 : 0) +
    v.accountIds.length +
    v.bankIds.length +
    v.tagIds.length +
    v.methodIds.length +
    v.kinds.length
  );
}

/** Filters that only make sense for planned payments — a bank has no expenses. */
export function paymentAttrFilterActive(v: ListFilterValue): boolean {
  return (
    v.search.trim() !== '' ||
    v.accountIds.length > 0 ||
    v.bankIds.length > 0 ||
    v.tagIds.length > 0 ||
    v.methodIds.length > 0
  );
}

/** Filters an expense can't possibly satisfy (it has no bank / method / link). */
export function expenseIncompatibleFilterActive(v: ListFilterValue): boolean {
  return (
    v.search.trim() !== '' ||
    v.bankIds.length > 0 ||
    v.methodIds.length > 0
  );
}

const toggle = <T,>(list: T[], id: T): T[] =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

export function ListFilters({
  value,
  onChange,
  accounts,
  banks,
  tags,
  methods,
  unpaidOnly,
  onUnpaidOnlyChange,
}: {
  value: ListFilterValue;
  onChange: (next: ListFilterValue) => void;
  accounts: Account[];
  banks: Bank[];
  tags: Tag[];
  methods: PaymentMethod[];
  unpaidOnly: boolean;
  onUnpaidOnlyChange: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = listFilterCount(value);
  const chipCount = count - (value.search.trim() ? 1 : 0);

  const chipGroup = (
    label: string,
    items: { id: string; name: string; color: string }[],
    key: 'accountIds' | 'bankIds' | 'tagIds' | 'methodIds',
  ) => {
    if (items.length === 0) return null;
    const selected = value[key];
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
          {label}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {items.map((it) => {
            const on = selected.includes(it.id);
            return (
              <button
                key={it.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange({ ...value, [key]: toggle(selected, it.id) })
                }
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
                  on
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-line-strong text-muted hover:text-ink',
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: it.color }}
                />
                {it.name}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            type="text"
            aria-label="Search payments"
            placeholder="Search description, notes, link…"
            className={cn('pl-9', value.search && 'pr-9')}
            value={value.search}
            onChange={(e) => onChange({ ...value, search: e.target.value })}
          />
          {value.search ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onChange({ ...value, search: '' })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={unpaidOnly}
          onClick={() => onUnpaidOnlyChange(!unpaidOnly)}
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium',
            unpaidOnly
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-line-strong text-muted hover:text-ink',
          )}
        >
          Unpaid only
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium',
            chipCount > 0 || open
              ? 'border-accent text-accent'
              : 'border-line-strong text-muted hover:text-ink',
          )}
        >
          Filters
          {chipCount > 0 ? (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg">
              {chipCount}
            </span>
          ) : null}
        </button>
      </div>

      {open ? (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Show
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(KIND_LABELS) as ListKind[]).map((k) => {
                const on = value.kinds.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      onChange({ ...value, kinds: toggle(value.kinds, k) })
                    }
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium',
                      on
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-line-strong text-muted hover:text-ink',
                    )}
                  >
                    {KIND_LABELS[k]}
                  </button>
                );
              })}
            </div>
          </div>
          {chipGroup('Payment method', methods, 'methodIds')}
          {chipGroup('Account', accounts, 'accountIds')}
          {chipGroup('Bank', banks, 'bankIds')}
          {chipGroup('Tags', tags, 'tagIds')}
        </div>
      ) : null}

      {count > 0 ? (
        <button
          type="button"
          onClick={() => onChange(EMPTY_LIST_FILTER)}
          className="inline-flex items-center gap-1 self-start text-xs text-muted hover:text-ink"
        >
          <X size={13} />
          Clear {count === 1 ? 'filter' : 'filters'}
        </button>
      ) : null}
    </div>
  );
}
