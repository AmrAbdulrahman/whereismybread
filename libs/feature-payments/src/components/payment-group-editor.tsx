'use client';

import { useState } from 'react';
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';
import { convertMoney, formatMoney, money, type RateMap } from '@wib/domain';
import {
  AmountField,
  Button,
  Input,
  MethodIcon,
  ResponsiveModal,
} from '@wib/ui';
import { Plus, X } from '@wib/ui/icons';
import type { PaymentFormValues } from '../lib/schema';
import { MethodMarkPicker } from './method-mark-picker';

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `li-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Sum every record with a usable value, converted into `currency`. */
function totalMinorOf(
  rows: PaymentFormValues['lineItems'],
  currency: string,
  rates: RateMap,
): number {
  const target = currency.toUpperCase();
  return (rows ?? []).reduce((sum, r) => {
    const n = Number(String(r.value ?? '').replace(/[, ]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return sum;
    const c = convertMoney(
      money(Math.round(n * 100), r.currency || target),
      target,
      rates,
    );
    return c.currency === target ? sum + c.minorUnits : sum;
  }, 0);
}

/**
 * The editor for a `group` payment's records — a repeatable list of
 * `{ mark, name, value + currency }` rows with a live total. The total is
 * shown converted into the payment's own currency at current rates.
 */
export function PaymentGroupEditor({
  control,
  register,
  setValue,
  currency,
  usedCurrencies,
  rates,
  error,
}: {
  control: Control<PaymentFormValues>;
  register: UseFormRegister<PaymentFormValues>;
  setValue: UseFormSetValue<PaymentFormValues>;
  currency: string;
  usedCurrencies: string[];
  rates: RateMap;
  error?: string;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lineItems',
    keyName: 'rhfId',
  });
  const rows = useWatch({ control, name: 'lineItems' });
  const [markRow, setMarkRow] = useState<number | null>(null);

  const totalMinor = totalMinorOf(rows, currency, rates);
  const mixed = (rows ?? []).some(
    (r) => r.currency && r.currency.toUpperCase() !== currency.toUpperCase(),
  );

  return (
    <div className="flex flex-col gap-2">
      {fields.map((field, i) => {
        const row = rows?.[i] ?? field;
        const mark = row.logoUrl ? (
          <img
            src={row.logoUrl}
            alt=""
            className="h-full w-full object-contain"
          />
        ) : row.iconKey ? (
          <MethodIcon iconKey={row.iconKey} size={16} />
        ) : (
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: row.color || 'var(--color-accent)' }}
          />
        );
        return (
          <div key={field.rhfId} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMarkRow(i)}
              aria-label={`Icon for record ${i + 1}`}
              className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
            >
              {mark}
            </button>
            <Input
              aria-label={`Record ${i + 1} name`}
              placeholder="Name"
              className="min-w-0 flex-1"
              {...register(`lineItems.${i}.name`)}
            />
            <Controller
              control={control}
              name={`lineItems.${i}.value`}
              render={({ field: vf, fieldState }) => (
                <AmountField
                  id={`li-value-${i}`}
                  className="w-32 shrink-0 sm:w-40"
                  amount={vf.value ?? ''}
                  onAmountChange={vf.onChange}
                  onAmountBlur={vf.onBlur}
                  currency={row.currency || currency}
                  onCurrencyChange={(c) =>
                    setValue(`lineItems.${i}.currency`, c, {
                      shouldDirty: true,
                    })
                  }
                  usedCurrencies={usedCurrencies}
                  invalid={!!fieldState.error}
                />
              )}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove record ${i + 1}`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>
        );
      })}

      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={() =>
          append({
            id: newId(),
            name: '',
            value: '',
            currency,
            iconKey: null,
            logoUrl: null,
            color: null,
          })
        }
      >
        <Plus size={15} strokeWidth={2.5} />
        Add a record
      </Button>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
        <span className="text-xs text-muted">
          {fields.length} record{fields.length === 1 ? '' : 's'}
          {mixed ? ' · converted' : ''}
        </span>
        <span className="font-display text-sm font-semibold tabular-nums text-ink">
          {formatMoney(money(totalMinor, currency))}
        </span>
      </div>

      <ResponsiveModal
        open={markRow != null}
        onOpenChange={(o) => !o && setMarkRow(null)}
        title="Record icon"
      >
        {markRow != null ? (
          <div className="flex flex-col gap-4">
            <MethodMarkPicker
              iconKey={rows?.[markRow]?.iconKey ?? 'wallet'}
              logoUrl={rows?.[markRow]?.logoUrl ?? null}
              onIconChange={(key) => {
                setValue(`lineItems.${markRow}.iconKey`, key, {
                  shouldDirty: true,
                });
                setValue(`lineItems.${markRow}.logoUrl`, null, {
                  shouldDirty: true,
                });
              }}
              onLogoChange={(uri) =>
                setValue(`lineItems.${markRow}.logoUrl`, uri, {
                  shouldDirty: true,
                })
              }
              onColorChange={(hex) =>
                setValue(`lineItems.${markRow}.color`, hex, {
                  shouldDirty: true,
                })
              }
              onNameSuggest={(name) => {
                if (!rows?.[markRow]?.name?.trim())
                  setValue(`lineItems.${markRow}.name`, name, {
                    shouldDirty: true,
                  });
              }}
            />
            <Button
              type="button"
              className="self-end"
              onClick={() => setMarkRow(null)}
            >
              Done
            </Button>
          </div>
        ) : null}
      </ResponsiveModal>
    </div>
  );
}
