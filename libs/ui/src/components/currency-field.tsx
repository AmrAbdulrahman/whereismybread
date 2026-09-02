'use client';

import { useMemo, useState } from 'react';
import { CURRENCIES, currencyMeta, type CurrencyMeta } from '@wib/domain';
import { cn } from '../lib/cn';
import { Input } from './input';
import { ResponsiveModal } from './responsive-modal';

export function CurrencyField({
  value,
  onChange,
  usedCodes = [],
  id,
  triggerClassName,
}: {
  value: string;
  onChange: (code: string) => void;
  /** Shown in a "Used" group above the full list. */
  usedCodes?: string[];
  id?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const meta = currencyMeta(value);

  const { used, rest } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (c: CurrencyMeta) =>
      !q ||
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q);
    const usedSet = new Set(usedCodes.map((c) => c.toUpperCase()));
    return {
      used: CURRENCIES.filter((c) => usedSet.has(c.code) && matches(c)),
      rest: CURRENCIES.filter((c) => !usedSet.has(c.code) && matches(c)),
    };
  }, [query, usedCodes]);

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery('');
  };

  const Row = ({ c }: { c: CurrencyMeta }) => (
    <button
      type="button"
      onClick={() => pick(c.code)}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-2',
        c.code === value && 'bg-surface-2',
      )}
    >
      <span className="w-8 shrink-0 text-center text-muted">{c.symbol}</span>
      <span className="font-mono text-xs font-semibold text-ink">{c.code}</span>
      <span className="truncate text-ink-soft">{c.name}</span>
    </button>
  );

  return (
    <>
      <button
        type="button"
        id={id}
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-10 items-center justify-between rounded-md border border-line-strong bg-ground px-3 text-sm text-ink',
          triggerClassName,
        )}
      >
        <span className="font-mono font-semibold">{meta.code}</span>
        <span className="text-muted">▾</span>
      </button>

      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title="Choose currency"
      >
        <div className="flex flex-col gap-2">
          <Input
            autoFocus
            placeholder="Search currencies…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-[55dvh] overflow-y-auto">
            {used.length > 0 ? (
              <>
                <p className="px-2 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wide text-muted">
                  Used
                </p>
                {used.map((c) => (
                  <Row key={`u-${c.code}`} c={c} />
                ))}
              </>
            ) : null}
            <p className="px-2 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wide text-muted">
              All currencies
            </p>
            {rest.map((c) => (
              <Row key={c.code} c={c} />
            ))}
            {used.length === 0 && rest.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted">
                No match for “{query}”.
              </p>
            ) : null}
          </div>
        </div>
      </ResponsiveModal>
    </>
  );
}
