'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney, money, toMajor } from '@wib/domain';
import {
  AmountField,
  Button,
  Field,
  Input,
  Label,
  ResponsiveModal,
} from '@wib/ui';
import { resetMonthIncomeAction, setMonthIncomeAction } from '../lib/actions';

export interface MonthIncomeEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string; // YYYY-MM
  monthLabel: string;
  mode: 'fixed' | 'hourly';
  /** Pay per hour, in incomeCurrency minor units (hourly mode). */
  hourlyRateMinor: number;
  /** Usual hours per month (hourly mode) — the default this month starts from. */
  defaultHours: number;
  /** What this month's override currently stores, if any. */
  override: {
    amountMinor: number | null;
    currency: string | null;
    hours: number | null;
  } | null;
  /** The effective figure for the month, in `effectiveCurrency` minor units. */
  effectiveRawMinor: number;
  effectiveCurrency: string;
  /** The global monthly income, in incomeCurrency minor units. */
  globalRawMinor: number;
  incomeCurrency: string;
  usedCurrencies?: string[];
  isOverride: boolean;
}

export function MonthIncomeEditor({
  open,
  onOpenChange,
  month,
  monthLabel,
  mode,
  hourlyRateMinor,
  defaultHours,
  override,
  effectiveRawMinor,
  effectiveCurrency,
  globalRawMinor,
  incomeCurrency,
  usedCurrencies = [],
  isOverride,
}: MonthIncomeEditorProps) {
  const router = useRouter();
  const hourly = mode === 'hourly';

  const [amount, setAmount] = useState(() =>
    effectiveRawMinor
      ? String(toMajor(money(effectiveRawMinor, effectiveCurrency)))
      : '',
  );
  const [currency, setCurrency] = useState(
    override?.currency ?? effectiveCurrency ?? incomeCurrency,
  );
  const [hours, setHours] = useState(() =>
    String(override?.hours ?? defaultHours ?? ''),
  );
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const done = () => {
    setBusy(false);
    onOpenChange(false);
    router.refresh();
  };

  const hoursNum = Number(hours.replace(/[, ]/g, '') || '0');
  const hoursPreviewMinor = Number.isFinite(hoursNum)
    ? Math.round(hourlyRateMinor * hoursNum)
    : 0;

  const save = async () => {
    setBusy(true);
    setError(undefined);
    const result = await setMonthIncomeAction(
      month,
      hourly ? { hours } : { amount, currency },
    );
    if (result.ok) return done();
    setBusy(false);
    setError(
      result.error ??
        result.fieldErrors?.['hours']?.[0] ??
        result.fieldErrors?.['amount']?.[0] ??
        'Could not save.',
    );
  };

  const reset = async () => {
    setBusy(true);
    setError(undefined);
    const result = await resetMonthIncomeAction(month);
    if (result.ok) return done();
    setBusy(false);
    setError(result.error ?? 'Could not reset.');
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Income for ${monthLabel}`}
      description={
        isOverride
          ? 'This month has its own figure. Reset it to follow your usual income.'
          : hourly
            ? `Enter the hours you worked this month. Your rate is ${formatMoney(
                money(hourlyRateMinor, incomeCurrency),
              )} / hour.`
            : `Set a one-off figure for this month. Your usual income is ${formatMoney(
                money(globalRawMinor, incomeCurrency),
              )}.`
      }
    >
      <div className="flex flex-col gap-4">
        {hourly ? (
          <Field>
            <Label htmlFor="month-hours">Hours worked</Label>
            <Input
              id="month-hours"
              inputMode="decimal"
              placeholder={String(defaultHours || 0)}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted">
              = {formatMoney(money(hoursPreviewMinor, incomeCurrency))} this month
            </p>
          </Field>
        ) : (
          <Field>
            <Label htmlFor="month-income">Take-home this month</Label>
            <AmountField
              id="month-income"
              amount={amount}
              onAmountChange={setAmount}
              currency={currency}
              onCurrencyChange={setCurrency}
              usedCurrencies={usedCurrencies}
              autoFocus
            />
          </Field>
        )}

        {error ? <p className="text-xs text-danger">{error}</p> : null}

        {isOverride ? (
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className="self-start text-xs font-medium text-muted hover:text-ink disabled:opacity-50"
          >
            Reset to default
          </button>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
