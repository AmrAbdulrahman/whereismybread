'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import type { Expense } from '@wib/db';
import { AmountField, Button, Field, Input, Label } from '@wib/ui';
import { discardBlobsAction } from '../lib/actions';
import {
  removeExpenseAttachmentAction,
  saveExpenseAction,
  uploadExpenseAttachmentAction,
} from '../lib/budget-actions';
import {
  expenseFormSchema,
  type ExpenseFormValues,
} from '../lib/expense-schema';
import type { OccurrenceAttachment } from '../lib/types';
import { AttachmentsField } from './attachments-field';

export interface ExpenseFormBudgetOption {
  id: string;
  name: string;
  currency: string;
}

export interface ExpenseFormInitial {
  id: string;
  budgetId: string;
  name: string;
  amountMinor: number;
  currency: string;
  notes: string | null;
  attachments: OccurrenceAttachment[];
}

export function ExpenseForm({
  budgets,
  budgetId,
  initial,
  usedCurrencies = [],
  onDone,
  onCancel,
}: {
  budgets: ExpenseFormBudgetOption[];
  /** Which budget to preselect — the one the "Add expense" button was on. */
  budgetId: string;
  initial?: ExpenseFormInitial;
  usedCurrencies?: string[];
  onDone: (expense: Expense) => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string>();
  const [savedAttachments, setSavedAttachments] = useState<
    OccurrenceAttachment[]
  >(() => initial?.attachments ?? []);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    mode: 'onTouched',
    defaultValues: initial
      ? {
          budgetId: initial.budgetId,
          name: initial.name,
          amount: (initial.amountMinor / 100).toFixed(2),
          currency: initial.currency,
          notes: initial.notes ?? '',
          attachments: [],
        }
      : {
          budgetId,
          name: '',
          amount: '',
          currency:
            budgets.find((b) => b.id === budgetId)?.currency ?? 'EUR',
          notes: '',
          attachments: [],
        },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await saveExpenseAction(initial?.id ?? null, values);
    if (result.ok && result.item) {
      onDone(result.item);
      return;
    }
    if (result.fieldErrors) {
      for (const [field, msgs] of Object.entries(result.fieldErrors)) {
        if (msgs[0])
          setError(field as keyof ExpenseFormValues, { message: msgs[0] });
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

      {budgets.length > 1 ? (
        <Field>
          <Label htmlFor="expense-budget">Budget</Label>
          <select
            id="expense-budget"
            {...register('budgetId')}
            className="h-10 w-full rounded-md border border-line-strong bg-ground px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {budgets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field>
        <Label htmlFor="expense-name">Name</Label>
        <Input
          id="expense-name"
          placeholder="Coffee, Train ticket, Groceries…"
          autoFocus
          {...register('name')}
        />
        {errors.name?.message ? (
          <p className="text-xs text-danger">{errors.name.message}</p>
        ) : null}
      </Field>

      <Field>
        <Label htmlFor="expense-amount">Amount</Label>
        <AmountField
          id="expense-amount"
          amount={watch('amount') ?? ''}
          onAmountChange={(v) => setValue('amount', v, { shouldDirty: true })}
          currency={watch('currency') ?? 'EUR'}
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
        <Label htmlFor="expense-notes">Notes (optional)</Label>
        <textarea
          id="expense-notes"
          rows={2}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          data-form-type="other"
          placeholder="Anything worth remembering about this expense…"
          className="rounded-md border border-line-strong bg-ground px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          {...register('notes')}
        />
      </Field>

      <Field>
        <Label>Attachments</Label>
        <Controller
          control={control}
          name="attachments"
          render={({ field }) => (
            <AttachmentsField
              ownerId={initial?.id ?? null}
              saved={savedAttachments}
              onSavedChange={setSavedAttachments}
              drafts={field.value ?? []}
              onDraftsChange={(next) =>
                field.onChange(next as typeof field.value)
              }
              upload={uploadExpenseAttachmentAction}
              remove={removeExpenseAttachmentAction}
              discard={discardBlobsAction}
            />
          )}
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            const staged = (getValues('attachments') ?? [])
              .map((a) => a.url)
              .filter(Boolean);
            if (!initial && staged.length > 0) {
              void discardBlobsAction(staged);
            }
            onCancel();
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Saving…'
            : initial
              ? 'Save changes'
              : 'Add expense'}
        </Button>
      </div>
    </form>
  );
}
