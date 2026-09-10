'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  denomKey,
  formatDebtAmount,
  goldQuantityString,
  type DebtDenomination,
} from '@wib/domain';
import {
  AttachmentsField,
  Button,
  Field,
  Input,
  Label,
  type AttachmentDraft,
} from '@wib/ui';
import {
  discardDebtBlobsAction,
  recordRepaymentAction,
  removeDebtAttachmentAction,
  uploadDebtAttachmentAction,
} from '../lib/actions';
import { repaymentFormSchema, type RepaymentFormValues } from '../lib/schema';
import type { DenomBalanceView } from '../lib/types';
import { DenominationFields, type DenomValue } from './denomination-fields';
import { GoldMark } from './gold-mark';

function denomToValue(d: DebtDenomination, fallbackCurrency: string): DenomValue {
  return {
    amount: '',
    denomKind: d.kind,
    currency: d.kind === 'money' ? d.currency : fallbackCurrency,
    goldType: d.kind === 'gold' ? d.goldType : 'k21',
    goldLabel: d.kind === 'gold' ? d.goldLabel : null,
    goldUnit: d.kind === 'gold' ? d.unit : 'g',
  };
}

export function RepaymentForm({
  debtId,
  balances,
  presetDenomKey,
  today,
  defaultCurrency,
  usedCurrencies = [],
  onDone,
  onCancel,
}: {
  debtId: string;
  balances: DenomBalanceView[];
  /** Lock the form to this balance's denomination (opened from a balance row). */
  presetDenomKey?: string;
  today: string;
  defaultCurrency: string;
  usedCurrencies?: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string>();

  const preset =
    (presetDenomKey &&
      balances.find((b) => denomKey(b.denom) === presetDenomKey)) ||
    null;
  const baseDenom: DebtDenomination =
    preset?.denom ??
    balances[0]?.denom ??
    ({ kind: 'money', currency: defaultCurrency } as const);
  const init = denomToValue(baseDenom, defaultCurrency);

  const isGold = baseDenom.kind === 'gold';
  const unitLabel = isGold
    ? baseDenom.unit === 'piece'
      ? 'pieces'
      : 'g'
    : baseDenom.currency;
  const restValue = preset
    ? isGold
      ? goldQuantityString(preset.outstandingMinor)
      : (preset.outstandingMinor / 100).toFixed(2)
    : null;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RepaymentFormValues>({
    resolver: zodResolver(repaymentFormSchema),
    mode: 'onTouched',
    defaultValues: {
      amount: '',
      denomKind: init.denomKind,
      currency: init.currency,
      goldType: init.goldType,
      goldLabel: init.goldLabel,
      goldUnit: init.goldUnit,
      occurredOn: today,
      note: null,
      attachments: [],
    },
  });

  const drafts = watch('attachments') ?? [];

  const denomValue: DenomValue = {
    amount: watch('amount') ?? '',
    denomKind: watch('denomKind') ?? init.denomKind,
    currency: watch('currency') ?? init.currency,
    goldType: watch('goldType') ?? init.goldType,
    goldLabel: (watch('goldLabel') as string | null) ?? null,
    goldUnit: watch('goldUnit') ?? init.goldUnit,
  };
  const onDenomChange = (patch: Partial<DenomValue>) => {
    for (const [k, v] of Object.entries(patch)) {
      setValue(k as keyof RepaymentFormValues, v as never, {
        shouldDirty: true,
      });
    }
  };

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await recordRepaymentAction(debtId, values);
    if (result.ok) {
      onDone();
      return;
    }
    for (const [field, msgs] of Object.entries(result.fieldErrors ?? {})) {
      if (msgs[0])
        setError(field as keyof RepaymentFormValues, { message: msgs[0] });
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

      {preset ? (
        <Field>
          <Label htmlFor="repayment-amount">Amount ({unitLabel})</Label>
          <div className="flex items-center gap-2">
            {baseDenom.kind === 'gold' ? (
              <GoldMark type={baseDenom.goldType} size={16} />
            ) : null}
            <Input
              id="repayment-amount"
              className="flex-1"
              inputMode="decimal"
              placeholder={isGold ? '0' : '0.00'}
              aria-invalid={errors.amount ? true : undefined}
              {...register('amount')}
            />
          </div>
          {restValue && preset.outstandingMinor > 0 ? (
            <button
              type="button"
              onClick={() =>
                setValue('amount', restValue, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              className="self-start text-[11px] font-medium text-accent underline-offset-2 hover:underline"
            >
              Repay the rest ·{' '}
              {formatDebtAmount(preset.outstandingMinor, preset.denom)}
            </button>
          ) : null}
          {errors.amount?.message ? (
            <p className="text-xs text-danger">{errors.amount.message}</p>
          ) : null}
        </Field>
      ) : (
        <DenominationFields
          idPrefix="repayment"
          value={denomValue}
          onChange={onDenomChange}
          usedCurrencies={usedCurrencies}
          amountError={errors.amount?.message}
          goldLabelError={errors.goldLabel?.message}
        />
      )}

      <Field>
        <Label htmlFor="repayment-date">Date</Label>
        <Input id="repayment-date" type="date" {...register('occurredOn')} />
        {errors.occurredOn?.message ? (
          <p className="text-xs text-danger">{errors.occurredOn.message}</p>
        ) : null}
      </Field>

      <Field>
        <Label htmlFor="repayment-note">Note (optional)</Label>
        <Input
          id="repayment-note"
          placeholder="Bank transfer, cash…"
          {...register('note')}
        />
      </Field>

      <Field>
        <Label>Attachments (optional)</Label>
        <AttachmentsField
          inputId="repayment-attachment"
          ownerId={null}
          saved={[]}
          onSavedChange={() => undefined}
          drafts={drafts as AttachmentDraft[]}
          onDraftsChange={(next) =>
            setValue('attachments', next, { shouldDirty: true })
          }
          upload={(_o, form) => uploadDebtAttachmentAction(null, null, form)}
          remove={removeDebtAttachmentAction}
          discard={discardDebtBlobsAction}
        />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Record repayment'}
        </Button>
      </div>
    </form>
  );
}
