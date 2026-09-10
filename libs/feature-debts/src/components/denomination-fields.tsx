'use client';

import { GOLD_CUSTOM_KEY, GOLD_TYPES, goldUnitFor } from '@wib/domain';
import { AmountField, Field, Input, Label, cn } from '@wib/ui';

export interface DenomValue {
  /** Money minor-unit string, or a gold quantity string. */
  amount: string;
  denomKind: 'money' | 'gold';
  currency: string;
  goldType: string;
  goldLabel: string | null;
  goldUnit: 'g' | 'piece';
}

const GOLD_GROUPS: { label: string; group: 'carat' | 'coin' | 'bar' }[] = [
  { label: 'Purity (grams)', group: 'carat' },
  { label: 'Coins', group: 'coin' },
  { label: 'Bars (999)', group: 'bar' },
];

/**
 * The "Owed in" money/gold picker + amount, shared by the debt-edit form and
 * every line of the multi-line create form. Fully controlled — the parent owns
 * the values (from RHF `watch`) and applies patches (via `setValue`).
 */
export function DenominationFields({
  value,
  onChange,
  usedCurrencies = [],
  amountError,
  goldLabelError,
  idPrefix = 'denom',
  showKindToggle = true,
}: {
  value: DenomValue;
  onChange: (patch: Partial<DenomValue>) => void;
  usedCurrencies?: string[];
  amountError?: string;
  goldLabelError?: string;
  idPrefix?: string;
  showKindToggle?: boolean;
}) {
  const isGold = value.denomKind === 'gold';
  const goldTypeKey = value.goldType || 'k21';
  const isCustomGold = goldTypeKey === GOLD_CUSTOM_KEY;
  const effUnit = isCustomGold
    ? value.goldUnit || 'g'
    : goldUnitFor(goldTypeKey, null);

  const pickGoldType = (key: string) => {
    onChange(
      key === GOLD_CUSTOM_KEY
        ? { goldType: key }
        : { goldType: key, goldUnit: goldUnitFor(key, null) },
    );
  };

  return (
    <>
      {showKindToggle ? (
        <Field>
          <Label>Owed in</Label>
          <div className="flex gap-1">
            {(
              [
                ['money', 'Money'],
                ['gold', 'Gold'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => onChange({ denomKind: v })}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  value.denomKind === v
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-line-strong text-muted hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
      ) : null}

      {isGold ? (
        <>
          <Field>
            <Label htmlFor={`${idPrefix}-gold-type`}>Gold type</Label>
            <select
              id={`${idPrefix}-gold-type`}
              className="h-10 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink"
              value={goldTypeKey}
              onChange={(e) => pickGoldType(e.target.value)}
            >
              {GOLD_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.label}>
                  {GOLD_TYPES.filter((t) => t.group === g.group).map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                      {t.hint ? ` — ${t.hint}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value={GOLD_CUSTOM_KEY}>Custom…</option>
            </select>
          </Field>

          {isCustomGold ? (
            <Field>
              <Label htmlFor={`${idPrefix}-gold-label`}>Name it</Label>
              <Input
                id={`${idPrefix}-gold-label`}
                placeholder="e.g. 22K, mixed scrap, bangle"
                value={value.goldLabel ?? ''}
                onChange={(e) => onChange({ goldLabel: e.target.value })}
              />
              <div className="mt-1 flex gap-1">
                {(
                  [
                    ['g', 'Grams'],
                    ['piece', 'Pieces'],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onChange({ goldUnit: v })}
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                      value.goldUnit === v
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-line-strong text-muted hover:text-ink',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {goldLabelError ? (
                <p className="text-xs text-danger">{goldLabelError}</p>
              ) : null}
            </Field>
          ) : null}

          <Field>
            <Label htmlFor={`${idPrefix}-amount`}>
              Quantity ({effUnit === 'piece' ? 'pieces' : 'g'})
            </Label>
            <Input
              id={`${idPrefix}-amount`}
              inputMode="decimal"
              placeholder="0"
              aria-invalid={amountError ? true : undefined}
              value={value.amount}
              onChange={(e) => onChange({ amount: e.target.value })}
            />
            {amountError ? (
              <p className="text-xs text-danger">{amountError}</p>
            ) : null}
          </Field>
        </>
      ) : (
        <Field>
          <Label htmlFor={`${idPrefix}-amount`}>Amount</Label>
          <AmountField
            id={`${idPrefix}-amount`}
            amount={value.amount}
            onAmountChange={(v) => onChange({ amount: v })}
            currency={value.currency}
            onCurrencyChange={(c) => onChange({ currency: c })}
            usedCurrencies={usedCurrencies}
            invalid={!!amountError}
          />
          {amountError ? (
            <p className="text-xs text-danger">{amountError}</p>
          ) : null}
        </Field>
      )}
    </>
  );
}
