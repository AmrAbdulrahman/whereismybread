'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { goldQuantityString } from '@wib/domain';
import { Button } from '@wib/ui';
import { addLineAction, updateLineAction } from '../lib/actions';
import { debtLineSchema, type DebtLineValue } from '../lib/schema';
import type { DebtRowView } from '../lib/types';
import { DenominationFields, type DenomValue } from './denomination-fields';

/** Add a row to a debt basket, or edit / fix an existing one. */
export function LineForm({
  debtId,
  line,
  defaultCurrency,
  usedCurrencies = [],
  onDone,
  onCancel,
}: {
  debtId: string;
  line?: DebtRowView;
  defaultCurrency: string;
  usedCurrencies?: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string>();

  const d = line?.denom;
  const {
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DebtLineValue>({
    resolver: zodResolver(debtLineSchema),
    mode: 'onTouched',
    defaultValues: {
      amount: line
        ? d?.kind === 'gold'
          ? goldQuantityString(line.amountMinor)
          : (line.amountMinor / 100).toFixed(2)
        : '',
      denomKind: d?.kind ?? 'money',
      currency: d?.kind === 'money' ? d.currency : defaultCurrency,
      goldType: d?.kind === 'gold' ? d.goldType : 'k21',
      goldLabel: d?.kind === 'gold' ? d.goldLabel : null,
      goldUnit: d?.kind === 'gold' ? d.unit : 'g',
    },
  });

  const value: DenomValue = {
    amount: watch('amount') ?? '',
    denomKind: watch('denomKind') ?? 'money',
    currency: watch('currency') ?? defaultCurrency,
    goldType: watch('goldType') ?? 'k21',
    goldLabel: (watch('goldLabel') as string | null) ?? null,
    goldUnit: watch('goldUnit') ?? 'g',
  };
  const onChange = (patch: Partial<DenomValue>) => {
    for (const [k, v] of Object.entries(patch)) {
      setValue(k as keyof DebtLineValue, v as never, { shouldDirty: true });
    }
  };

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = line
      ? await updateLineAction(debtId, line.id, values)
      : await addLineAction(debtId, values);
    if (result.ok) {
      onDone();
      return;
    }
    for (const [field, msgs] of Object.entries(result.fieldErrors ?? {})) {
      if (msgs[0]) setError(field as keyof DebtLineValue, { message: msgs[0] });
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

      <DenominationFields
        idPrefix="line"
        value={value}
        onChange={onChange}
        usedCurrencies={usedCurrencies}
        amountError={errors.amount?.message}
        goldLabelError={errors.goldLabel?.message}
      />

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : line ? 'Save row' : 'Add row'}
        </Button>
      </div>
    </form>
  );
}
