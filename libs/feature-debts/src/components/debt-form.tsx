'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import {
  AttachmentsField,
  Button,
  Field,
  Input,
  Label,
  ResponsiveModal,
  type AttachmentDraft,
  type StoredAttachment,
} from '@wib/ui';
import { Plus, Trash2 } from '@wib/ui/icons';
import {
  discardDebtBlobsAction,
  removeDebtAttachmentAction,
  saveDebtAction,
  uploadDebtAttachmentAction,
} from '../lib/actions';
import {
  debtFormSchema,
  debtMetaSchema,
  type DebtFormValues,
} from '../lib/schema';
import type { DebtView, PersonView } from '../lib/types';
import { DenominationFields, type DenomValue } from './denomination-fields';
import { DirectionToggle } from './direction-toggle';
import { PersonForm } from './person-form';

/** Editing an existing debt — metadata only (rows are managed on the detail page). */
export interface DebtFormInitial {
  id: string;
  personId: string;
  direction: 'they_owe' | 'i_owe';
  incurredOn: string;
  description: string;
  notes: string | null;
}

function emptyLine(currency: string) {
  return {
    amount: '',
    denomKind: 'money' as const,
    currency,
    goldType: 'k21',
    goldLabel: null,
    goldUnit: 'g' as const,
  };
}

export function DebtForm({
  people,
  person,
  initial,
  direction: presetDirection,
  today,
  defaultCurrency,
  usedCurrencies = [],
  onDone,
  onCancel,
}: {
  people: PersonView[];
  /** Pre-select (and lock) the person — used from a person panel's "＋ Add". */
  person?: PersonView;
  /** Present → edit that debt's metadata. Absent → create a new basket. */
  initial?: DebtFormInitial;
  direction?: 'they_owe' | 'i_owe';
  today: string;
  defaultCurrency: string;
  usedCurrencies?: string[];
  onDone: (result: { debtId: string; debt?: DebtView }) => void;
  onCancel: () => void;
}) {
  const isEdit = initial != null;
  const [formError, setFormError] = useState<string>();
  const [roster, setRoster] = useState(people);
  const [addingPerson, setAddingPerson] = useState(false);
  const [saved, setSaved] = useState<StoredAttachment[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DebtFormValues>({
    resolver: zodResolver(
      (isEdit ? debtMetaSchema : debtFormSchema) as typeof debtFormSchema,
    ),
    mode: 'onTouched',
    defaultValues: {
      personId: initial?.personId ?? person?.id ?? people[0]?.id ?? '',
      direction: initial?.direction ?? presetDirection ?? 'i_owe',
      incurredOn: initial?.incurredOn ?? today,
      description: initial?.description ?? '',
      notes: initial?.notes ?? null,
      attachments: [],
      lines: isEdit ? [] : [emptyLine(defaultCurrency)],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  // A locked person never rides an input — register its value so `handleSubmit`
  // sees it (RHF drops unregistered non-default fields).
  useEffect(() => {
    if (person) setValue('personId', person.id);
  }, [person, setValue]);

  const direction = watch('direction');
  const personId = watch('personId');
  const lines = watch('lines') ?? [];
  const drafts = watch('attachments') ?? [];

  const denomAt = (i: number): DenomValue => {
    const l = lines[i] ?? emptyLine(defaultCurrency);
    return {
      amount: l.amount ?? '',
      denomKind: (l.denomKind as 'money' | 'gold') ?? 'money',
      currency: l.currency ?? defaultCurrency,
      goldType: l.goldType ?? 'k21',
      goldLabel: (l.goldLabel as string | null) ?? null,
      goldUnit: (l.goldUnit as 'g' | 'piece') ?? 'g',
    };
  };
  const patchDenom = (i: number, patch: Partial<DenomValue>) => {
    for (const [k, v] of Object.entries(patch)) {
      setValue(`lines.${i}.${k}` as never, v as never, { shouldDirty: true });
    }
  };

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await saveDebtAction(initial?.id ?? null, values);
    if (result.ok && result.debtId) {
      onDone({ debtId: result.debtId, debt: result.debt });
      return;
    }
    for (const [field, msgs] of Object.entries(result.fieldErrors ?? {})) {
      if (msgs[0]) {
        setError(field as keyof DebtFormValues, { message: msgs[0] });
        if (!field.includes('.')) setFormError(msgs[0]);
      }
    }
    setFormError(result.error ?? formError);
  });

  const onPersonAdded = (p: PersonView) => {
    setRoster((prev) => [p, ...prev.filter((x) => x.id !== p.id)]);
    setValue('personId', p.id, { shouldDirty: true, shouldValidate: true });
    setAddingPerson(false);
  };

  const nLines = fields.length;

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
          {person ? (
            <p className="text-sm text-ink">
              {person.name} · <span className="text-muted">{person.email}</span>
            </p>
          ) : (
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
          )}
          {errors.personId?.message ? (
            <p className="text-xs text-danger">{errors.personId.message}</p>
          ) : null}
        </Field>

        <DirectionToggle
          value={direction ?? 'i_owe'}
          onChange={(v) => setValue('direction', v, { shouldDirty: true })}
        />

        {isEdit ? null : (
          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              {nLines > 1 ? `Rows (${nLines})` : 'Amount'}
            </span>
            {fields.map((f, i) => {
              const lineErr = errors.lines?.[i];
              return (
                <div
                  key={f.id}
                  className="flex flex-col gap-3 rounded-lg border border-line bg-surface/60 p-3"
                >
                  {nLines > 1 ? (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                        Row {i + 1}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove row ${i + 1}`}
                        onClick={() => remove(i)}
                        className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-surface-2 hover:text-danger"
                      >
                        <Trash2 size={13} strokeWidth={2} />
                      </button>
                    </div>
                  ) : null}

                  <DenominationFields
                    idPrefix={`row-${i}`}
                    value={denomAt(i)}
                    onChange={(patch) => patchDenom(i, patch)}
                    usedCurrencies={usedCurrencies}
                    amountError={lineErr?.amount?.message}
                    goldLabelError={lineErr?.goldLabel?.message}
                  />
                </div>
              );
            })}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => append(emptyLine(defaultCurrency))}
            >
              <Plus size={14} strokeWidth={2.5} />
              Add a row
            </Button>
          </div>
        )}

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

        {isEdit ? null : (
          <Field>
            <Label>Attachments (optional)</Label>
            <AttachmentsField
              inputId="debt-attachment"
              ownerId={null}
              saved={saved}
              onSavedChange={setSaved}
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
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || roster.length === 0}>
            {isSubmitting
              ? 'Saving…'
              : isEdit
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
