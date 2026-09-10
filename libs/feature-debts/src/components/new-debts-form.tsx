'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { Button, Field, Input, Label, ResponsiveModal } from '@wib/ui';
import { Plus, Trash2 } from '@wib/ui/icons';
import { saveDebtsAction } from '../lib/actions';
import { newDebtsSchema, type NewDebtsValues } from '../lib/schema';
import type { DebtView, PersonView } from '../lib/types';
import { DenominationFields, type DenomValue } from './denomination-fields';
import { DirectionToggle } from './direction-toggle';
import { PersonForm } from './person-form';

function emptyLine(currency: string, today: string) {
  return {
    amount: '',
    denomKind: 'money' as const,
    currency,
    goldType: 'k21',
    goldLabel: null,
    goldUnit: 'g' as const,
    note: '',
    occurredOn: today,
  };
}

export function NewDebtsForm({
  people,
  person,
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
  direction?: 'they_owe' | 'i_owe';
  today: string;
  defaultCurrency: string;
  usedCurrencies?: string[];
  onDone: (created: DebtView[]) => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string>();
  const [roster, setRoster] = useState(people);
  const [addingPerson, setAddingPerson] = useState(false);

  const {
    handleSubmit,
    watch,
    setValue,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<NewDebtsValues>({
    resolver: zodResolver(newDebtsSchema),
    mode: 'onTouched',
    defaultValues: {
      personId: person?.id ?? people[0]?.id ?? '',
      direction: presetDirection ?? 'i_owe',
      lines: [emptyLine(defaultCurrency, today)],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  // A locked person is never touched via an input, so register its value so it
  // reaches `handleSubmit` (RHF drops unregistered non-default fields).
  useEffect(() => {
    if (person) setValue('personId', person.id);
  }, [person, setValue]);

  const direction = watch('direction');
  const personId = watch('personId');
  const lines = watch('lines') ?? [];

  const denomAt = (i: number): DenomValue => {
    const l = lines[i] ?? emptyLine(defaultCurrency, today);
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
    const result = await saveDebtsAction(values);
    if (result.ok) {
      onDone(result.debts ?? []);
      return;
    }
    for (const [field, msgs] of Object.entries(result.fieldErrors ?? {})) {
      if (msgs[0]) {
        setError(field as keyof NewDebtsValues, { message: msgs[0] });
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
          <Label htmlFor="nd-person">Person</Label>
          {person ? (
            <p className="text-sm text-ink">
              {person.name} · <span className="text-muted">{person.email}</span>
            </p>
          ) : (
            <div className="flex gap-2">
              <select
                id="nd-person"
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

        {fields.map((f, i) => {
          const lineErr = errors.lines?.[i];
          return (
            <div
              key={f.id}
              className="flex flex-col gap-3 rounded-lg border border-line bg-surface/60 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {nLines > 1 ? `Entry ${i + 1}` : 'Amount'}
                </span>
                {nLines > 1 ? (
                  <button
                    type="button"
                    aria-label={`Remove entry ${i + 1}`}
                    onClick={() => remove(i)}
                    className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-surface-2 hover:text-danger"
                  >
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                ) : null}
              </div>

              <DenominationFields
                idPrefix={`nd-${i}`}
                value={denomAt(i)}
                onChange={(patch) => patchDenom(i, patch)}
                usedCurrencies={usedCurrencies}
                amountError={lineErr?.amount?.message}
                goldLabelError={lineErr?.goldLabel?.message}
              />

              <div className="flex gap-2">
                <Field className="flex-1">
                  <Label htmlFor={`nd-${i}-note`}>Note (optional)</Label>
                  <Input
                    id={`nd-${i}-note`}
                    placeholder="Concert tickets, taxi…"
                    value={(lines[i]?.note as string | undefined) ?? ''}
                    onChange={(e) =>
                      setValue(`lines.${i}.note`, e.target.value, {
                        shouldDirty: true,
                      })
                    }
                  />
                </Field>
                <Field className="w-40">
                  <Label htmlFor={`nd-${i}-date`}>Date</Label>
                  <Input
                    id={`nd-${i}-date`}
                    type="date"
                    value={lines[i]?.occurredOn ?? today}
                    onChange={(e) =>
                      setValue(`lines.${i}.occurredOn`, e.target.value, {
                        shouldDirty: true,
                      })
                    }
                  />
                </Field>
              </div>
            </div>
          );
        })}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => append(emptyLine(defaultCurrency, today))}
        >
          <Plus size={14} strokeWidth={2.5} />
          Add another entry
        </Button>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || roster.length === 0}
          >
            {isSubmitting
              ? 'Saving…'
              : nLines > 1
                ? `Add ${nLines} debts`
                : 'Add debt'}
          </Button>
        </div>
        {roster.length === 0 ? (
          <p className="-mt-2 text-[11px] text-muted">
            Add a person first — that&apos;s who the debts are with.
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
