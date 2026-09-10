'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { AmountField, Button, Field, Input, Label, ResponsiveModal, cn } from '@wib/ui';
import { Plus } from '@wib/ui/icons';
import { saveDebtAction } from '../lib/actions';
import { debtFormSchema, type DebtFormValues } from '../lib/schema';
import type { PersonView } from '../lib/types';
import { PersonForm } from './person-form';

export interface DebtFormInitial {
  id: string;
  personId: string;
  direction: 'they_owe' | 'i_owe';
  amountMinor: number;
  currency: string;
  description: string;
  notes: string | null;
}

export function DebtForm({
  people,
  initial,
  defaultCurrency,
  usedCurrencies = [],
  onDone,
  onCancel,
}: {
  people: PersonView[];
  initial?: DebtFormInitial;
  defaultCurrency: string;
  usedCurrencies?: string[];
  onDone: (debtId: string) => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string>();
  const [roster, setRoster] = useState(people);
  const [addingPerson, setAddingPerson] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DebtFormValues>({
    resolver: zodResolver(debtFormSchema),
    mode: 'onTouched',
    defaultValues: {
      personId: initial?.personId ?? people[0]?.id ?? '',
      direction: initial?.direction ?? 'they_owe',
      amount: initial ? (initial.amountMinor / 100).toFixed(2) : '',
      currency: initial?.currency ?? defaultCurrency,
      description: initial?.description ?? '',
      notes: initial?.notes ?? null,
    },
  });

  const direction = watch('direction');
  const personId = watch('personId');
  const currency = watch('currency');

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await saveDebtAction(initial?.id ?? null, values);
    if (result.ok && result.debtId) {
      onDone(result.debtId);
      return;
    }
    for (const [field, msgs] of Object.entries(result.fieldErrors ?? {})) {
      if (msgs[0]) setError(field as keyof DebtFormValues, { message: msgs[0] });
    }
    setFormError(result.error);
  });

  const onPersonAdded = (person: PersonView) => {
    setRoster((prev) => [person, ...prev.filter((p) => p.id !== person.id)]);
    setValue('personId', person.id, { shouldDirty: true, shouldValidate: true });
    setAddingPerson(false);
  };

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {formError ? (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        ) : null}

        <Field>
          <Label htmlFor="debt-person">Person</Label>
          <div className="flex gap-2">
            <select
              id="debt-person"
              className="h-10 flex-1 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink"
              value={personId}
              onChange={(e) =>
                setValue('personId', e.target.value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <option value="" disabled>
                Choose a person…
              </option>
              {roster.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.email}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => setAddingPerson(true)}
            >
              <Plus size={14} strokeWidth={2.5} />
              New
            </Button>
          </div>
          {errors.personId?.message ? (
            <p className="text-xs text-danger">{errors.personId.message}</p>
          ) : null}
        </Field>

        <Field>
          <Label>Direction</Label>
          <div className="flex gap-1">
            {(
              [
                ['they_owe', 'They owe me'],
                ['i_owe', 'I owe them'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setValue('direction', value, { shouldDirty: true })
                }
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  direction === value
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
          <Label htmlFor="debt-amount">Amount</Label>
          <AmountField
            id="debt-amount"
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
          <Label htmlFor="debt-description">What&apos;s it for?</Label>
          <Input
            id="debt-description"
            placeholder="Concert tickets, shared taxi…"
            {...register('description')}
          />
          {errors.description?.message ? (
            <p className="text-xs text-danger">{errors.description.message}</p>
          ) : null}
        </Field>

        <Field>
          <Label htmlFor="debt-notes">Notes (optional)</Label>
          <textarea
            id="debt-notes"
            rows={2}
            className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink"
            placeholder="Anything worth remembering"
            {...register('notes')}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || roster.length === 0}>
            {isSubmitting
              ? 'Saving…'
              : initial
                ? 'Save changes'
                : 'Create debt'}
          </Button>
        </div>
        {roster.length === 0 ? (
          <p className="-mt-2 text-[11px] text-muted">
            Add a person first — that&apos;s who the debt is with.
          </p>
        ) : null}
      </form>

      <ResponsiveModal
        open={addingPerson}
        onOpenChange={setAddingPerson}
        title="New person"
      >
        {addingPerson ? (
          <PersonForm
            onDone={onPersonAdded}
            onCancel={() => setAddingPerson(false)}
          />
        ) : null}
      </ResponsiveModal>
    </>
  );
}
