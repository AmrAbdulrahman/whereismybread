'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { goldQuantityString, type DebtDenomination } from '@wib/domain';
import {
  AttachmentsField,
  Button,
  Field,
  Input,
  Label,
  ResponsiveModal,
  cn,
  type AttachmentDraft,
  type StoredAttachment,
} from '@wib/ui';
import { Plus } from '@wib/ui/icons';
import {
  discardDebtBlobsAction,
  removeDebtAttachmentAction,
  saveDebtAction,
  uploadDebtAttachmentAction,
} from '../lib/actions';
import { debtFormSchema, type DebtFormValues } from '../lib/schema';
import type { PersonView } from '../lib/types';
import { DenominationFields, type DenomValue } from './denomination-fields';
import { PersonForm } from './person-form';

export interface DebtFormInitial {
  id: string;
  personId: string;
  direction: 'they_owe' | 'i_owe';
  /** Principal in the denomination's units (minor money units / gold thousandths). */
  principalMinor: number;
  denom: DebtDenomination;
  incurredOn: string;
  description: string;
  notes: string | null;
  attachments: StoredAttachment[];
}

export function DebtForm({
  people,
  initial,
  today,
  defaultCurrency,
  usedCurrencies = [],
  onDone,
  onCancel,
}: {
  people: PersonView[];
  initial?: DebtFormInitial;
  today: string;
  defaultCurrency: string;
  usedCurrencies?: string[];
  onDone: (debtId: string) => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string>();
  const [roster, setRoster] = useState(people);
  const [addingPerson, setAddingPerson] = useState(false);
  const [saved, setSaved] = useState<StoredAttachment[]>(
    initial?.attachments ?? [],
  );

  const initGold = initial?.denom.kind === 'gold' ? initial.denom : null;
  const initAmount = initial
    ? initGold
      ? goldQuantityString(initial.principalMinor)
      : (initial.principalMinor / 100).toFixed(2)
    : '';

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
      amount: initAmount,
      denomKind: initial?.denom.kind ?? 'money',
      currency:
        initial?.denom.kind === 'money'
          ? initial.denom.currency
          : defaultCurrency,
      goldType: initGold?.goldType ?? 'k21',
      goldLabel: initGold?.goldLabel ?? null,
      goldUnit: initGold?.unit ?? 'g',
      incurredOn: initial?.incurredOn ?? today,
      description: initial?.description ?? '',
      notes: initial?.notes ?? null,
      attachments: [],
    },
  });

  const direction = watch('direction');
  const personId = watch('personId');
  const drafts = watch('attachments') ?? [];

  const denomValue: DenomValue = {
    amount: watch('amount') ?? '',
    denomKind: watch('denomKind') ?? 'money',
    currency: watch('currency') ?? defaultCurrency,
    goldType: watch('goldType') ?? 'k21',
    goldLabel: (watch('goldLabel') as string | null) ?? null,
    goldUnit: watch('goldUnit') ?? 'g',
  };
  const onDenomChange = (patch: Partial<DenomValue>) => {
    for (const [k, v] of Object.entries(patch)) {
      setValue(k as keyof DebtFormValues, v as never, { shouldDirty: true });
    }
  };

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

        <DenominationFields
          idPrefix="debt"
          value={denomValue}
          onChange={onDenomChange}
          usedCurrencies={usedCurrencies}
          amountError={errors.amount?.message}
          goldLabelError={errors.goldLabel?.message}
        />

        <Field>
          <Label htmlFor="debt-date">Date incurred</Label>
          <Input id="debt-date" type="date" {...register('incurredOn')} />
          {errors.incurredOn?.message ? (
            <p className="text-xs text-danger">{errors.incurredOn.message}</p>
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

        <Field>
          <Label>Attachments (optional)</Label>
          <AttachmentsField
            inputId="debt-attachment"
            ownerId={initial?.id ?? null}
            saved={saved}
            onSavedChange={setSaved}
            drafts={drafts as AttachmentDraft[]}
            onDraftsChange={(next) =>
              setValue('attachments', next, { shouldDirty: true })
            }
            upload={(ownerId, form) =>
              uploadDebtAttachmentAction(ownerId, null, form)
            }
            remove={removeDebtAttachmentAction}
            discard={discardDebtBlobsAction}
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
