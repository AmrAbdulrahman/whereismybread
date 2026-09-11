'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CURRENCIES,
  GOLD_TYPES,
  goldTypeLabel,
  goldUnitFor,
  type CurrencyMeta,
} from '@wib/domain';
import { Field, Input, Label, ResponsiveModal, cn } from '@wib/ui';
import { Plus } from '@wib/ui/icons';
import { listThingsAction } from '../lib/actions';
import type { ThingView } from '../lib/types';
import { GoldMark } from './gold-mark';
import { ThingMark } from './thing-mark';

/**
 * Hold the things catalogue for a form, seeded from the page and refreshed once
 * on mount so a thing added elsewhere (or just now) shows up in the picker.
 */
export function useThings(initial: ThingView[] = []): [
  ThingView[],
  (t: ThingView) => void,
] {
  const [things, setThings] = useState(initial);
  useEffect(() => {
    let live = true;
    listThingsAction()
      .then((t) => {
        if (live && t.length) setThings(t);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const upsert = (t: ThingView) =>
    setThings((prev) => [t, ...prev.filter((x) => x.id !== t.id)]);
  return [things, upsert];
}

/** The denomination + quantity a debt row / repayment is measured in. */
export interface DenomValue {
  amount: string;
  kind: 'money' | 'gold' | 'thing';
  currency: string;
  goldType: string;
  thingId: string | null;
  thingName: string | null;
  unit: 'g' | 'piece';
}

const GOLD_GROUPS: { label: string; group: 'carat' | 'coin' | 'bar' }[] = [
  { label: 'Purity (grams)', group: 'carat' },
  { label: 'Coins', group: 'coin' },
  { label: 'Bars (999)', group: 'bar' },
];

function unitLabel(v: DenomValue): string {
  if (v.kind === 'money') return 'Amount';
  return v.unit === 'piece' ? 'Quantity (pieces)' : 'Quantity (g)';
}

/**
 * One control for "how much, in what": an amount on the left and a single unit
 * picker on the right, sharing a border. The picker lists currencies, built-in
 * gold types and the user's own "things" together.
 */
export function DenomField({
  value,
  onChange,
  usedCurrencies = [],
  things = [],
  onCreateThing,
  amountError,
  idPrefix = 'denom',
}: {
  value: DenomValue;
  onChange: (patch: Partial<DenomValue>) => void;
  usedCurrencies?: string[];
  things?: ThingView[];
  onCreateThing?: () => void;
  amountError?: string;
  idPrefix?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const amountId = `${idPrefix}-amount`;

  const { used, rest } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (c: CurrencyMeta) =>
      !q ||
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q);
    const usedSet = new Set(usedCurrencies.map((c) => c.toUpperCase()));
    return {
      used: CURRENCIES.filter((c) => usedSet.has(c.code) && matches(c)),
      rest: CURRENCIES.filter((c) => !usedSet.has(c.code) && matches(c)),
    };
  }, [query, usedCurrencies]);

  const q = query.trim().toLowerCase();
  const golds = GOLD_TYPES.filter(
    (t) =>
      !q ||
      t.label.toLowerCase().includes(q) ||
      (t.hint ?? '').toLowerCase().includes(q),
  );
  const matchedThings = things.filter(
    (t) => !q || t.name.toLowerCase().includes(q),
  );

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const pickCurrency = (code: string) => {
    onChange({ kind: 'money', currency: code });
    close();
  };
  const pickGold = (key: string) => {
    onChange({ kind: 'gold', goldType: key, unit: goldUnitFor(key, null) });
    close();
  };
  const pickThing = (t: ThingView) => {
    onChange({
      kind: 'thing',
      thingId: t.id,
      thingName: t.name,
      unit: t.unit,
    });
    close();
  };

  return (
    <Field>
      <Label htmlFor={amountId}>{unitLabel(value)}</Label>
      <div
        className={cn(
          'flex items-stretch overflow-hidden rounded-md border bg-ground',
          'focus-within:ring-2 focus-within:ring-accent',
          amountError ? 'border-danger' : 'border-line-strong',
        )}
      >
        <input
          id={amountId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder={value.kind === 'money' ? '0.00' : '0'}
          value={value.amount}
          aria-invalid={amountError ? true : undefined}
          onChange={(e) => onChange({ amount: e.target.value })}
          className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-ink placeholder:text-muted focus-visible:outline-none"
        />
        <span className="my-1.5 w-px shrink-0 bg-line-strong" aria-hidden />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Change unit"
          className="flex shrink-0 items-center gap-1.5 px-2.5 text-sm text-ink"
        >
          <DenomTag value={value} things={things} />
          <span className="text-muted">▾</span>
        </button>
      </div>
      {amountError ? (
        <p className="text-xs text-danger">{amountError}</p>
      ) : null}

      <ResponsiveModal open={open} onOpenChange={setOpen} title="Amount in…">
        <div className="flex flex-col gap-2">
          <Input
            autoFocus
            placeholder="Search currencies, gold, things…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-[55dvh] overflow-y-auto">
            {matchedThings.length > 0 || onCreateThing ? (
              <>
                <SectionLabel>Your things</SectionLabel>
                {matchedThings.map((t) => (
                  <PickRow
                    key={t.id}
                    selected={value.kind === 'thing' && value.thingId === t.id}
                    onClick={() => pickThing(t)}
                    icon={<ThingMark thing={t} size={20} />}
                    label={t.name}
                    hint={t.unit === 'piece' ? 'pieces' : 'grams'}
                  />
                ))}
                {onCreateThing ? (
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onCreateThing();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-accent hover:bg-surface-2"
                  >
                    <Plus size={16} strokeWidth={2.5} />
                    New thing…
                  </button>
                ) : null}
              </>
            ) : null}

            {(used.length > 0 || rest.length > 0) && (
              <SectionLabel>Currencies</SectionLabel>
            )}
            {[...used, ...rest].slice(0, 60).map((c) => (
              <PickRow
                key={c.code}
                selected={value.kind === 'money' && value.currency === c.code}
                onClick={() => pickCurrency(c.code)}
                icon={
                  <span className="w-5 text-center text-muted">{c.symbol}</span>
                }
                label={c.name}
                hint={c.code}
              />
            ))}

            {golds.length > 0 ? <SectionLabel>Gold</SectionLabel> : null}
            {GOLD_GROUPS.map((g) => {
              const items = golds.filter((t) => t.group === g.group);
              if (items.length === 0) return null;
              return (
                <div key={g.group}>
                  <p className="px-2 pt-1.5 text-[10px] uppercase tracking-wide text-muted/70">
                    {g.label}
                  </p>
                  {items.map((t) => (
                    <PickRow
                      key={t.key}
                      selected={
                        value.kind === 'gold' && value.goldType === t.key
                      }
                      onClick={() => pickGold(t.key)}
                      icon={<GoldMark type={t.key} size={20} />}
                      label={t.label}
                      hint={t.hint}
                    />
                  ))}
                </div>
              );
            })}

            {used.length + rest.length + golds.length + matchedThings.length ===
            0 ? (
              <p className="px-2 py-3 text-sm text-muted">
                No match for “{query}”.
              </p>
            ) : null}
          </div>
        </div>
      </ResponsiveModal>
    </Field>
  );
}

/** The compact "current unit" shown inside the field trigger. */
export function DenomTag({
  value,
  things = [],
}: {
  value: DenomValue;
  things?: ThingView[];
}) {
  if (value.kind === 'money') {
    return <span className="font-mono font-semibold">{value.currency}</span>;
  }
  if (value.kind === 'thing') {
    const t = things.find((x) => x.id === value.thingId);
    return (
      <span className="flex items-center gap-1">
        <ThingMark
          thing={{
            name: value.thingName ?? 'Item',
            logoUrl: t?.logoUrl ?? null,
          }}
          size={16}
        />
        <span className="max-w-[8rem] truncate">
          {value.thingName ?? 'Item'}
        </span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <GoldMark type={value.goldType} size={16} />
      <span className="max-w-[8rem] truncate">
        {goldTypeLabel(value.goldType, null)}
      </span>
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wide text-muted">
      {children}
    </p>
  );
}

function PickRow({
  selected,
  onClick,
  icon,
  label,
  hint,
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-2',
        selected && 'bg-surface-2',
      )}
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-ink-soft">{label}</span>
      {hint ? (
        <span className="shrink-0 font-mono text-xs text-muted">{hint}</span>
      ) : null}
    </button>
  );
}
