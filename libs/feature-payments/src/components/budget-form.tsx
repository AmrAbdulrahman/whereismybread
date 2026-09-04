'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { Budget } from '@wib/db';
import {
  endOfMonth,
  startOfMonth,
  weeksInMonth,
  type IsoDate,
} from '@wib/domain';
import {
  AmountField,
  Button,
  COLOR_PALETTE,
  ColorPicker,
  Field,
  Input,
  Label,
  cn,
} from '@wib/ui';
import { saveBudgetAction } from '../lib/budget-actions';
import { budgetFormSchema, type BudgetFormValues } from '../lib/budget-schema';

function formatWeek(start: string, end: string): string {
  const fmt = (d: string, withMonth: boolean) =>
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      ...(withMonth ? { month: 'short' } : {}),
      timeZone: 'UTC',
    }).format(new Date(`${d}T00:00:00Z`));
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${fmt(start, !sameMonth)} – ${fmt(end, true)}`;
}

export interface BudgetFormInitial {
  id: string;
  name: string;
  period: 'month' | 'week';
  startDate: string;
  endDate: string;
  amountMinor: number;
  currency: string;
  color: string;
  recurring: boolean;
}

export function BudgetForm({
  today,
  initial,
  defaultCurrency,
  usedCurrencies = [],
  onDone,
  onCancel,
}: {
  today: IsoDate;
  initial?: BudgetFormInitial;
  defaultCurrency: string;
  usedCurrencies?: string[];
  onDone: (budget: Budget) => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string>();
  const [pickerMonth, setPickerMonth] = useState<IsoDate>(
    startOfMonth(initial?.startDate ?? today),
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetFormSchema),
    mode: 'onTouched',
    defaultValues: initial
      ? {
          name: initial.name,
          period: initial.period,
          startDate: initial.startDate,
          endDate: initial.endDate,
          amount: (initial.amountMinor / 100).toFixed(2),
          currency: initial.currency,
          color: initial.color,
          recurring: initial.recurring,
        }
      : {
          name: '',
          period: 'month',
          startDate: startOfMonth(today),
          endDate: endOfMonth(today),
          amount: '',
          currency: defaultCurrency,
          color: COLOR_PALETTE[0],
          recurring: false,
        },
  });

  const period = watch('period');
  const startDate = watch('startDate');
  const endDate = watch('endDate');
  const color = watch('color');
  const currency = watch('currency');
  const recurring = watch('recurring');

  const setPeriod = (v: 'month' | 'week') => {
    setValue('period', v, { shouldDirty: true });
    if (v === 'month') {
      setValue('startDate', startOfMonth(pickerMonth), { shouldDirty: true });
      setValue('endDate', endOfMonth(pickerMonth), { shouldDirty: true });
    } else {
      setValue('recurring', false, { shouldDirty: true });
      const first = weeksInMonth(pickerMonth)[0];
      if (first) {
        setValue('startDate', first.start, { shouldDirty: true });
        setValue('endDate', first.end, { shouldDirty: true });
      }
    }
  };

  const onPickerMonthChange = (value: string) => {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    const m = `${value}-01` as IsoDate;
    setPickerMonth(m);
    if (period === 'month') {
      setValue('startDate', startOfMonth(m), { shouldDirty: true });
      setValue('endDate', endOfMonth(m), { shouldDirty: true });
    } else {
      const first = weeksInMonth(m)[0];
      if (first) {
        setValue('startDate', first.start, { shouldDirty: true });
        setValue('endDate', first.end, { shouldDirty: true });
      }
    }
  };

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await saveBudgetAction(initial?.id ?? null, values);
    if (result.ok && result.item) {
      onDone(result.item);
      return;
    }
    if (result.fieldErrors) {
      for (const [field, msgs] of Object.entries(result.fieldErrors)) {
        if (msgs[0])
          setError(field as keyof BudgetFormValues, { message: msgs[0] });
      }
    }
    setFormError(result.error);
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {formError ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <Field>
        <Label htmlFor="budget-name">Name</Label>
        <Input
          id="budget-name"
          placeholder="Groceries, Fun money, Travel…"
          {...register('name')}
        />
        {errors.name?.message ? (
          <p className="text-xs text-danger">{errors.name.message}</p>
        ) : null}
      </Field>

      <Field>
        <Label>Timespan</Label>
        <div className="flex gap-1">
          {(
            [
              ['month', 'Whole month'],
              ['week', 'One week'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeriod(value)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                period === value
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line-strong text-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      <Field>
        <Label htmlFor="budget-month">Month</Label>
        <Input
          id="budget-month"
          type="month"
          value={pickerMonth.slice(0, 7)}
          onChange={(e) => onPickerMonthChange(e.target.value)}
        />
      </Field>

      {period === 'month' ? (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={recurring ?? false}
            onChange={(e) =>
              setValue('recurring', e.target.checked, { shouldDirty: true })
            }
            className="h-4 w-4 rounded border-line-strong accent-accent"
          />
          Repeat this budget every month
        </label>
      ) : null}

      {period === 'week' ? (
        <Field>
          <Label>Week</Label>
          <div className="flex flex-wrap gap-1.5">
            {weeksInMonth(pickerMonth).map((w) => {
              const active = w.start === startDate && w.end === endDate;
              return (
                <button
                  key={w.start}
                  type="button"
                  onClick={() => {
                    setValue('startDate', w.start, { shouldDirty: true });
                    setValue('endDate', w.end, { shouldDirty: true });
                  }}
                  className={cn(
                    'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-line-strong text-muted hover:text-ink',
                  )}
                >
                  {formatWeek(w.start, w.end)}
                </button>
              );
            })}
          </div>
          {errors.endDate?.message ? (
            <p className="text-xs text-danger">{errors.endDate.message}</p>
          ) : null}
        </Field>
      ) : null}

      <Field>
        <Label htmlFor="budget-amount">Limit</Label>
        <AmountField
          id="budget-amount"
          amount={watch('amount') ?? ''}
          onAmountChange={(v) => setValue('amount', v, { shouldDirty: true })}
          currency={currency ?? defaultCurrency}
          onCurrencyChange={(c) =>
            setValue('currency', c, { shouldDirty: true })
          }
          usedCurrencies={usedCurrencies}
          invalid={!!errors.amount}
        />
        {errors.amount?.message ? (
          <p className="text-xs text-danger">{errors.amount.message}</p>
        ) : null}
      </Field>

      <Field>
        <Label>Colour</Label>
        <ColorPicker
          value={color ?? COLOR_PALETTE[0]}
          onChange={(c) => setValue('color', c, { shouldDirty: true })}
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Saving…'
            : initial
              ? 'Save changes'
              : 'Create budget'}
        </Button>
      </div>
    </form>
  );
}
