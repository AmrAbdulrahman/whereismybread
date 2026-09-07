'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import {
  preferencesSchema,
  updatePreferencesAction,
  type PreferencesInput,
} from '@wib/auth';
import {
  AmountField,
  Button,
  CurrencyField,
  Field,
  Input,
  Label,
  cn,
} from '@wib/ui';
import { applyServerErrors } from '../../_components/apply-server-errors';

export function PreferencesForm({
  timezone,
  timezoneAuto,
  defaultCurrency,
  displayCurrency,
  incomeMode,
  incomeCurrency,
  income,
  hourlyRate,
  monthlyHours,
}: {
  timezone: string;
  timezoneAuto: boolean;
  defaultCurrency: string;
  displayCurrency: string;
  incomeMode: 'fixed' | 'hourly';
  incomeCurrency: string;
  income: string;
  hourlyRate: string;
  monthlyHours: string;
}) {
  const [message, setMessage] = useState<string>();
  const [formError, setFormError] = useState<string>();

  const {
    handleSubmit,
    register,
    control,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PreferencesInput>({
    resolver: zodResolver(preferencesSchema),
    mode: 'onTouched',
    defaultValues: {
      timezone: timezoneAuto ? '' : timezone,
      defaultCurrency,
      displayCurrency,
      incomeMode,
      incomeCurrency,
      income,
      hourlyRate,
      monthlyHours,
    },
  });

  const mode = watch('incomeMode');
  const incomeCur = watch('incomeCurrency') ?? incomeCurrency;
  const setIncomeCur = (c: string) =>
    setValue('incomeCurrency', c, { shouldDirty: true });

  const tzValue = watch('timezone');
  const auto = !tzValue?.trim();
  const browserTz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  })();
  const setAuto = (on: boolean) =>
    setValue('timezone', on ? '' : timezoneAuto ? browserTz : timezone, {
      shouldDirty: true,
    });
  const detect = () =>
    setValue('timezone', browserTz, { shouldDirty: true });

  const onSubmit = handleSubmit(async (values) => {
    setMessage(undefined);
    setFormError(undefined);
    const result = await updatePreferencesAction(values);
    if (result.ok) setMessage(result.message);
    else setFormError(applyServerErrors(setError, result));
  });

  const used = [
    ...new Set([defaultCurrency, displayCurrency, incomeCur, incomeCurrency]),
  ];

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field>
        <Label htmlFor="timezone">Time zone</Label>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          Detect automatically
          <span className="text-muted">
            (currently {auto ? browserTz : 'off'})
          </span>
        </label>
        {auto ? null : (
          <div className="flex gap-2">
            <Input
              id="timezone"
              className="flex-1"
              placeholder="Europe/Berlin"
              {...register('timezone')}
            />
            <Button type="button" variant="secondary" onClick={detect}>
              Detect
            </Button>
          </div>
        )}
        <p className="text-xs text-muted">
          Used to work out what counts as “today”. Auto follows your device; an
          explicit zone stays fixed wherever you sign in.
        </p>
        {errors.timezone?.message ? (
          <p className="text-xs text-danger">{errors.timezone.message}</p>
        ) : null}
      </Field>

      <div className="flex flex-wrap gap-4">
        <Field className="min-w-32 flex-1">
          <Label htmlFor="defaultCurrency">Default currency</Label>
          <Controller
            control={control}
            name="defaultCurrency"
            render={({ field }) => (
              <CurrencyField
                id="defaultCurrency"
                value={field.value}
                onChange={field.onChange}
                usedCodes={used}
                triggerClassName="w-full"
              />
            )}
          />
          <p className="text-xs text-muted">New payments start here.</p>
        </Field>

        <Field className="min-w-32 flex-1">
          <Label htmlFor="displayCurrency">Display currency</Label>
          <Controller
            control={control}
            name="displayCurrency"
            render={({ field }) => (
              <CurrencyField
                id="displayCurrency"
                value={field.value}
                onChange={field.onChange}
                usedCodes={used}
                triggerClassName="w-full"
              />
            )}
          />
          <p className="text-xs text-muted">
            Amounts are converted into this, with the original in brackets.
          </p>
        </Field>
      </div>

      <Field>
        <Label>Income</Label>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['fixed', 'Fixed monthly'],
              ['hourly', 'Per hour'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                setValue('incomeMode', value, { shouldDirty: true })
              }
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                mode === value
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line-strong text-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          Used to gauge how much each month leaves spare. You can override it per
          month on the calendar.
        </p>
      </Field>

      {mode === 'hourly' ? (
        <div className="flex flex-wrap gap-4">
          <Field className="min-w-40 flex-1">
            <Label htmlFor="hourlyRate">Rate per hour</Label>
            <Controller
              control={control}
              name="hourlyRate"
              render={({ field }) => (
                <AmountField
                  id="hourlyRate"
                  amount={field.value ?? ''}
                  onAmountChange={field.onChange}
                  onAmountBlur={field.onBlur}
                  currency={incomeCur}
                  onCurrencyChange={setIncomeCur}
                  usedCurrencies={used}
                  placeholder="0"
                  invalid={!!errors.hourlyRate}
                />
              )}
            />
            {errors.hourlyRate?.message ? (
              <p className="text-xs text-danger">{errors.hourlyRate.message}</p>
            ) : null}
          </Field>
          <Field className="min-w-32 flex-1">
            <Label htmlFor="monthlyHours">Usual hours / month</Label>
            <Input
              id="monthlyHours"
              inputMode="decimal"
              placeholder="0"
              {...register('monthlyHours')}
            />
            <p className="text-xs text-muted">
              The default each month starts from.
            </p>
            {errors.monthlyHours?.message ? (
              <p className="text-xs text-danger">
                {errors.monthlyHours.message}
              </p>
            ) : null}
          </Field>
        </div>
      ) : (
        <Field>
          <Label htmlFor="income">Monthly income</Label>
          <Controller
            control={control}
            name="income"
            render={({ field }) => (
              <AmountField
                id="income"
                amount={field.value ?? ''}
                onAmountChange={field.onChange}
                onAmountBlur={field.onBlur}
                currency={incomeCur}
                onCurrencyChange={setIncomeCur}
                usedCurrencies={used}
                placeholder="0"
                invalid={!!errors.income}
              />
            )}
          />
          {errors.income?.message ? (
            <p className="text-xs text-danger">{errors.income.message}</p>
          ) : null}
        </Field>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
        {message ? <span className="text-sm text-teal">{message}</span> : null}
        {formError ? (
          <span className="text-sm text-danger">{formError}</span>
        ) : null}
      </div>
    </form>
  );
}
