'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import type { Account, Bank, Expense, Tag } from '@wib/db';
import {
  AmountField,
  Button,
  cn,
  Field,
  Input,
  Label,
  MethodIcon,
  ResponsiveModal,
  TagInput,
} from '@wib/ui';
import { Plus } from '@wib/ui/icons';
import { discardBlobsAction } from '../lib/actions';
import {
  deleteExpenseAction,
  removeExpenseAttachmentAction,
  saveExpenseAction,
  uploadExpenseAttachmentAction,
} from '../lib/budget-actions';
import {
  expenseFormSchema,
  type ExpenseFormValues,
} from '../lib/expense-schema';
import type { OccurrenceAttachment } from '../lib/types';
import { AccountForm } from './account-form';
import { AttachmentsField } from './attachments-field';
import { BankForm } from './bank-form';
import { ProviderField } from './provider-field';

export interface ExpenseFormBudgetOption {
  id: string;
  name: string;
  currency: string;
  /** `YYYY-MM-DD` — a recurring budget has one instance per month, sharing
   * a name, so the option label disambiguates with this. */
  startDate: string;
}

/** "Groceries" once, "Groceries — Sep 2026" when its name isn't unique. */
function budgetOptionLabels(
  budgets: ExpenseFormBudgetOption[],
): Map<string, string> {
  const counts = new Map<string, number>();
  for (const b of budgets) counts.set(b.name, (counts.get(b.name) ?? 0) + 1);
  const labels = new Map<string, string>();
  for (const b of budgets) {
    if ((counts.get(b.name) ?? 0) <= 1) {
      labels.set(b.id, b.name);
      continue;
    }
    const month = new Intl.DateTimeFormat('en-GB', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${b.startDate}T00:00:00Z`));
    labels.set(b.id, `${b.name} — ${month}`);
  }
  return labels;
}

export interface ExpenseFormInitial {
  id: string;
  budgetId: string | null;
  accountId: string | null;
  bankId: string | null;
  name: string;
  date: string;
  amountMinor: number;
  currency: string;
  notes: string | null;
  url: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  tags: string[];
  attachments: OccurrenceAttachment[];
}

export interface ExpenseFormPrefill {
  name?: string;
  amount?: string;
  currency?: string;
  notes?: string;
  bankId?: string | null;
  accountId?: string | null;
  tags?: string[];
  url?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
}

export function ExpenseForm({
  budgets,
  accounts: initialAccounts = [],
  banks: initialBanks = [],
  tags = [],
  budgetId = null,
  date,
  initial,
  prefill,
  usedCurrencies = [],
  onDone,
  onDeleted,
  onCancel,
}: {
  budgets: ExpenseFormBudgetOption[];
  accounts?: Account[];
  banks?: Bank[];
  tags?: Tag[];
  /** Which budget to preselect (e.g. the one "Add expense" was opened from). */
  budgetId?: string | null;
  /** The date to preselect (e.g. from a day separator's quick-add). */
  date: string;
  initial?: ExpenseFormInitial;
  /** New-expense-only defaults (e.g. from an imported bank transaction). Ignored in edit mode. */
  prefill?: ExpenseFormPrefill;
  usedCurrencies?: string[];
  onDone: (expense: Expense) => void;
  /** Editing only — called once a delete has gone through. */
  onDeleted?: () => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string>();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [addingAccount, setAddingAccount] = useState(false);
  const [banks, setBanks] = useState(initialBanks);
  const [addingBank, setAddingBank] = useState(false);
  const [savedAttachments, setSavedAttachments] = useState<
    OccurrenceAttachment[]
  >(() => initial?.attachments ?? []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
          budgetId: initial.budgetId ?? '',
          accountId: initial.accountId ?? '',
          bankId: initial.bankId ?? '',
          tags: initial.tags,
          name: initial.name,
          date: initial.date,
          amount: (initial.amountMinor / 100).toFixed(2),
          currency: initial.currency,
          notes: initial.notes ?? '',
          url: initial.url ?? '',
          logoUrl: initial.logoUrl ?? '',
          brandColor: initial.brandColor ?? '',
          attachments: [],
        }
      : {
          budgetId: budgetId ?? '',
          accountId: prefill?.accountId ?? '',
          bankId: prefill?.bankId ?? '',
          tags: prefill?.tags ?? [],
          name: prefill?.name ?? '',
          date,
          amount: prefill?.amount ?? '',
          currency:
            prefill?.currency ??
            budgets.find((b) => b.id === budgetId)?.currency ??
            'EUR',
          notes: prefill?.notes ?? '',
          url: prefill?.url ?? '',
          logoUrl: prefill?.logoUrl ?? '',
          brandColor: prefill?.brandColor ?? '',
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

  const runDelete = async () => {
    if (!initial) return;
    setDeleting(true);
    try {
      await deleteExpenseAction(initial.id);
      setConfirmDelete(false);
      onDeleted?.();
    } finally {
      setDeleting(false);
    }
  };

  const budgetLabels = budgetOptionLabels(budgets);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {formError ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Field className="flex-1">
          <Label htmlFor="expense-date">Date</Label>
          <Input id="expense-date" type="date" {...register('date')} />
          {errors.date?.message ? (
            <p className="text-xs text-danger">{errors.date.message}</p>
          ) : null}
        </Field>
        <Field className="flex-1">
          <Label htmlFor="expense-budget">Budget (optional)</Label>
          <select
            id="expense-budget"
            {...register('budgetId')}
            className="h-10 w-full rounded-md border border-line-strong bg-ground px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="">No budget</option>
            {budgets.map((b) => (
              <option key={b.id} value={b.id}>
                {budgetLabels.get(b.id) ?? b.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

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

      <ProviderField
        url={String(watch('url') ?? '')}
        onUrlChange={(v) => setValue('url', v, { shouldDirty: true })}
        logoUrl={(watch('logoUrl') as string | null) || null}
        onLogoUrlChange={(v) =>
          setValue('logoUrl', v ?? '', { shouldDirty: true })
        }
        onBrandColorChange={(v) =>
          setValue('brandColor', v ?? '', { shouldDirty: true })
        }
        name={String(watch('name') ?? '')}
        onNameChange={(v) => setValue('name', v, { shouldDirty: true })}
        error={
          typeof errors.url?.message === 'string' ? errors.url.message : undefined
        }
        id="expense-url"
      />

      <Field>
        <Label>Account</Label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setValue('accountId', '', { shouldDirty: true })}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium',
              !watch('accountId')
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-line-strong text-muted hover:text-ink',
            )}
          >
            None
          </button>
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() =>
                setValue('accountId', a.id, { shouldDirty: true })
              }
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
                watch('accountId') === a.id
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line-strong text-muted hover:text-ink',
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: a.color }}
              />
              {a.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAddingAccount(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-3 py-1.5 text-xs font-medium text-muted hover:text-ink"
          >
            <Plus size={13} strokeWidth={3} />
            New account
          </button>
        </div>
      </Field>

      <ResponsiveModal
        open={addingAccount}
        onOpenChange={setAddingAccount}
        title="New account"
        description="A group your spending belongs to — a company, a bill type, taxes…"
      >
        <AccountForm
          onCancel={() => setAddingAccount(false)}
          onCreated={(account) => {
            setAccounts((prev) => [...prev, account]);
            setValue('accountId', account.id, { shouldDirty: true });
            setAddingAccount(false);
          }}
        />
      </ResponsiveModal>

      <Field>
        <Label>Bank</Label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setValue('bankId', '', { shouldDirty: true })}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium',
              !watch('bankId')
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-line-strong text-muted hover:text-ink',
            )}
          >
            None
          </button>
          {banks.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setValue('bankId', b.id, { shouldDirty: true })}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
                watch('bankId') === b.id
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line-strong text-muted hover:text-ink',
              )}
            >
              {b.iconKey || b.logoUrl ? (
                <MethodIcon
                  iconKey={b.iconKey ?? 'bank'}
                  logoUrl={b.logoUrl}
                  size={13}
                />
              ) : (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: b.color }}
                />
              )}
              {b.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAddingBank(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-3 py-1.5 text-xs font-medium text-muted hover:text-ink"
          >
            <Plus size={13} strokeWidth={3} />
            New bank
          </button>
        </div>
      </Field>

      <ResponsiveModal
        open={addingBank}
        onOpenChange={setAddingBank}
        title="New bank"
        description="The bank or card this spend went through."
      >
        <BankForm
          onCancel={() => setAddingBank(false)}
          onCreated={(bank) => {
            setBanks((prev) => [...prev, bank]);
            setValue('bankId', bank.id, { shouldDirty: true });
            setAddingBank(false);
          }}
        />
      </ResponsiveModal>

      <Field>
        <Label>Tags</Label>
        <Controller
          control={control}
          name="tags"
          render={({ field }) => (
            <TagInput
              value={field.value ?? []}
              onChange={field.onChange}
              options={tags.map((t) => ({ name: t.name, color: t.color }))}
            />
          )}
        />
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

      <div className="flex items-center justify-between gap-2 pt-2">
        {initial ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-xs font-medium text-danger hover:underline"
          >
            Delete expense
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
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
      </div>

      <ResponsiveModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete expense?"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-soft">This can&apos;t be undone.</p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={deleting}
              onClick={() => void runDelete()}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </div>
      </ResponsiveModal>
    </form>
  );
}
