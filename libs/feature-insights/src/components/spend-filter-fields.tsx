'use client';

import { useId } from 'react';
import { Input, cn } from '@wib/ui';
import { parseMoneyInput, toMajor, money } from '@wib/domain';
import type { SpendFilterConfig } from '../lib/dashboard-compute';
import type { DashboardOption } from '../lib/dashboard';

type ListKey = 'accountIds' | 'tagIds' | 'methodIds' | 'bankIds';

const toggle = (list: string[] | undefined, id: string): string[] => {
  const cur = list ?? [];
  return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
};

function majorString(minor: number | undefined, currency: string): string {
  if (minor == null) return '';
  return String(toMajor(money(Math.round(minor), currency)));
}

/**
 * The faceted filter used by the stat builder (and, later, the custom-chart
 * builder). Purely controlled — the parent owns the `SpendFilterConfig`.
 */
export function SpendFilterFields({
  value,
  onChange,
  currency,
  accounts,
  tags,
  methods,
  banks,
}: {
  value: SpendFilterConfig;
  onChange: (next: SpendFilterConfig) => void;
  currency: string;
  accounts: DashboardOption[];
  tags: DashboardOption[];
  methods: DashboardOption[];
  banks: DashboardOption[];
}) {
  const uid = useId();
  const set = (patch: Partial<SpendFilterConfig>) =>
    onChange({ ...value, ...patch });

  const amountToMinor = (raw: string): number | undefined => {
    const s = raw.trim();
    if (!s) return undefined;
    try {
      return parseMoneyInput(s, currency).minorUnits;
    } catch {
      return undefined;
    }
  };

  const chipGroup = (label: string, items: DashboardOption[], key: ListKey) => {
    if (items.length === 0) return null;
    const selected = value[key] ?? [];
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
                onClick={() => {
                  const next = toggle(value[key], it.id);
                  set({ [key]: next.length ? next : undefined });
                }}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs',
                  on
                    ? 'border-accent bg-accent/10 text-ink'
                    : 'border-line text-ink-soft hover:text-ink',
                )}
              >
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${uid}-q`}
          className="text-[11px] font-medium uppercase tracking-wide text-muted"
        >
          Search
        </label>
        <Input
          id={`${uid}-q`}
          placeholder="name, note, account…"
          value={value.search ?? ''}
          onChange={(e) =>
            set({ search: e.target.value ? e.target.value : undefined })
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Segmented
          label="Source"
          options={[
            ['Any', undefined],
            ['Planned', 'planned'],
            ['Expenses', 'expense'],
          ]}
          value={value.source}
          onChange={(v) => set({ source: v as SpendFilterConfig['source'] })}
        />
        <Segmented
          label="Budget"
          options={[
            ['Any', undefined],
            ['Budgeted', 'y'],
            ['Unbudgeted', 'n'],
          ]}
          value={value.budgeted == null ? undefined : value.budgeted ? 'y' : 'n'}
          onChange={(v) =>
            set({ budgeted: v == null ? undefined : v === 'y' })
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Min amount
          </span>
          <Input
            inputMode="decimal"
            defaultValue={majorString(value.amountMinMinor, currency)}
            onBlur={(e) => set({ amountMinMinor: amountToMinor(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Max amount
          </span>
          <Input
            inputMode="decimal"
            defaultValue={majorString(value.amountMaxMinor, currency)}
            onBlur={(e) => set({ amountMaxMinor: amountToMinor(e.target.value) })}
          />
        </div>
      </div>

      {chipGroup('Accounts', accounts, 'accountIds')}
      {chipGroup('Tags', tags, 'tagIds')}
      {chipGroup('Methods', methods, 'methodIds')}
      {chipGroup('Banks', banks, 'bankIds')}
    </div>
  );
}

function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [string, string | undefined][];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <div className="flex rounded-lg border border-line p-0.5">
        {options.map(([lbl, v]) => (
          <button
            key={lbl}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              'flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
              value === v
                ? 'bg-surface-2 text-ink'
                : 'text-muted hover:text-ink-soft',
            )}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}
