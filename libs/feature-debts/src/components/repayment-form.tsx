'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
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

export function RepaymentForm({
  debtId,
  denom,
  remainingMinor,
  today,
  onDone,
  onCancel,
}: {
  debtId: string;
  denom: DebtDenomination;
  remainingMinor: number;
  today: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string>();

  const isGold = denom.kind === 'gold';
  const unitLabel = isGold
    ? denom.unit === 'piece'
      ? 'pieces'
      : 'g'
    : denom.currency;
  const restValue = isGold
    ? goldQuantityString(remainingMinor)
    : (remainingMinor / 100).toFixed(2);

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
    defaultValues: { amount: '', occurredOn: today, note: null, attachments: [] },
  });

  const drafts = watch('attachments') ?? [];

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

      <Field>
        <Label htmlFor="repayment-amount">Amount ({unitLabel})</Label>
        <Input
          id="repayment-amount"
          inputMode="decimal"
          placeholder={isGold ? '0' : '0.00'}
          {...register('amount')}
        />
        {remainingMinor > 0 ? (
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
            Repay the rest · {formatDebtAmount(remainingMinor, denom)}
          </button>
        ) : null}
        {errors.amount?.message ? (
          <p className="text-xs text-danger">{errors.amount.message}</p>
        ) : null}
      </Field>

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
          upload={(_o, form) =>
            uploadDebtAttachmentAction(null, null, form)
          }
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
