'use client';

import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import type {
  Account,
  Bank,
  PaymentMethod,
  RecipientMethod,
  Tag,
} from '@wib/db';
import { anchorForDayOfMonth, RECURRENCES } from '@wib/domain';
import {
  AmountField,
  Button,
  Field,
  Input,
  Label,
  MethodIcon,
  ResponsiveModal,
  Spinner,
  cn,
} from '@wib/ui';
import { ImagePlus, Plus } from '@wib/ui/icons';
import {
  deletePaymentAction,
  fetchBrandingAction,
  resetOccurrenceAction,
  savePaymentAction,
} from '../lib/actions';
import { readLastCurrency, writeLastCurrency } from '../lib/last-currency';
import { fileToLogoDataUrl } from '../lib/logo-file';
import { paymentFormSchema, type PaymentFormValues } from '../lib/schema';
import { AccountForm } from './account-form';
import { BankForm } from './bank-form';
import { RecipientMethodForm } from './recipient-method-form';
import { MethodForm } from './method-form';
import { TagInput } from './tag-input';

/** Method kinds for which a bank makes sense. */
const BANK_KINDS = new Set(['direct_debit', 'credit_card']);

const RECURRENCE_LABELS: Record<(typeof RECURRENCES)[number], string> = {
  one_time: 'One-time',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

export interface PaymentFormProps {
  methods: PaymentMethod[];
  accounts: Account[];
  banks: Bank[];
  recipientMethods: RecipientMethod[];
  tags: Tag[];
  defaultCurrency: string;
  today: string;
  /** Currencies already in use — surfaced first in the picker. */
  usedCurrencies?: string[];
  /** Present when editing. */
  initial?: Partial<PaymentFormValues> & { id: string };
  /** The due date of the occurrence the user opened, for scoped edits. */
  occurrenceDate?: string;
  /** True when that occurrence already carries a per-month override. */
  hasOverride?: boolean;
  onDone: () => void;
}

function fieldMessage(
  errors: Record<string, unknown>,
  key: string,
): string | undefined {
  const e = errors[key] as { message?: string } | undefined;
  return e?.message;
}

export function PaymentForm({
  methods: initialMethods,
  accounts: initialAccounts,
  banks: initialBanks,
  recipientMethods: initialRecipientMethods,
  tags,
  defaultCurrency,
  today,
  usedCurrencies = [],
  initial,
  occurrenceDate,
  hasOverride = false,
  onDone,
}: PaymentFormProps) {
  const [formError, setFormError] = useState<string>();
  const [methods, setMethods] = useState(initialMethods);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [banks, setBanks] = useState(initialBanks);
  const [recipientMethods, setRecipientMethods] = useState(
    initialRecipientMethods,
  );
  const [addingMethod, setAddingMethod] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [addingBank, setAddingBank] = useState(false);
  const [addingRecipientMethod, setAddingRecipientMethod] = useState(false);
  const [resetting, setResetting] = useState(false);

  /** A recurring payment opened on a specific occurrence can be scoped. */
  const canScope =
    initial != null &&
    initial.recurrence != null &&
    initial.recurrence !== 'one_time' &&
    !!occurrenceDate;

  // Deletes, and scoped saves, run through a confirmation modal.
  const [pending, setPending] = useState<
    null | { action: 'save'; values: PaymentFormValues } | { action: 'delete' }
  >(null);
  const [confirmScope, setConfirmScope] = useState<'this' | 'future'>(
    hasOverride ? 'this' : 'future',
  );
  const [busy, setBusy] = useState(false);

  const handleReset = async () => {
    if (!initial || !occurrenceDate) return;
    setResetting(true);
    try {
      const result = await resetOccurrenceAction(initial.id, occurrenceDate);
      if (result.ok) onDone();
      else setFormError(result.error);
    } finally {
      setResetting(false);
    }
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    mode: 'onTouched',
    defaultValues: {
      name: initial?.name ?? '',
      amountKind: initial?.amountKind ?? 'fixed',
      amount: initial?.amount ?? '',
      unitName: initial?.unitName ?? '',
      defaultUnits: initial?.defaultUnits ?? '1',
      feeKind: initial?.feeKind ?? 'none',
      feeValue: initial?.feeValue ?? '',
      currency: initial?.currency ?? readLastCurrency() ?? defaultCurrency,
      methodId: initial?.methodId ?? null,
      accountId: initial?.accountId ?? null,
      bankId: initial?.bankId ?? null,
      recipientMethodId: initial?.recipientMethodId ?? null,
      recurrence: initial?.recurrence ?? 'one_time',
      anchorDate: initial?.anchorDate ?? today,
      dayOfMonth:
        initial?.dayOfMonth ||
        (initial?.anchorDate ?? today).slice(8, 10).replace(/^0/, ''),
      endsOn: initial?.endsOn ?? '',
      url: initial?.url ?? '',
      logoUrl: initial?.logoUrl ?? '',
      brandColor: initial?.brandColor ?? '',
      notes: initial?.notes ?? '',
      tags: initial?.tags ?? [],
    },
  });

  const recurrence = watch('recurrence');
  const isRecurring = recurrence !== 'one_time';
  const dayOfMonth = watch('dayOfMonth');
  const amountKind = watch('amountKind');
  const perUnit = amountKind === 'per_unit';
  const unitName = watch('unitName');
  const unitLabel =
    typeof unitName === 'string' && unitName.trim() ? unitName.trim() : 'unit';
  /** Editing one occurrence of a per-unit payment → the qty field is "this month". */
  const editingOccurrence = perUnit && !!occurrenceDate;
  const feeKind = watch('feeKind') ?? 'none';
  const url = watch('url');
  const logoUrl = watch('logoUrl');

  // Recurring payments choose a day of the month; the anchor date (series
  // start) is synthesized from it so the rest of the pipeline is unchanged.
  useEffect(() => {
    if (!isRecurring) return;
    const day = Number(dayOfMonth);
    if (!Number.isInteger(day) || day < 1 || day > 31) return;
    const next = anchorForDayOfMonth(day, today, initial?.anchorDate ?? null);
    if (next !== getValues('anchorDate')) {
      setValue('anchorDate', next, { shouldValidate: true });
    }
  }, [isRecurring, dayOfMonth, today, initial?.anchorDate, getValues, setValue]);

  // Live branding: when a URL is entered, pull the logo + brand colour in.
  const [brandingBusy, setBrandingBusy] = useState(false);
  const [brandingNote, setBrandingNote] = useState<string>();
  const lastFetched = useRef<string>(String(initial?.url ?? ''));
  /** Set once the user uploads a logo by hand — a URL fetch won't overwrite it. */
  const manualLogo = useRef(false);

  // Manual logo upload: read the file, downscale, store as a data URI.
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string>();
  const onLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError(undefined);
    try {
      const uri = await fileToLogoDataUrl(file);
      manualLogo.current = true;
      setValue('logoUrl', uri, { shouldDirty: true });
    } catch (err) {
      setLogoError(
        err instanceof Error ? err.message : 'Could not use that image.',
      );
    }
  };

  useEffect(() => {
    const value = String(url ?? '').trim();
    if (
      !/^https?:\/\/.+\..+/i.test(value) &&
      !/^[\w-]+\.[a-z]{2,}/i.test(value)
    ) {
      return;
    }
    if (value === lastFetched.current) return;
    const handle = setTimeout(async () => {
      lastFetched.current = value;
      manualLogo.current = false;
      setBrandingNote(undefined);
      setBrandingBusy(true);
      try {
        const result = await fetchBrandingAction(value);
        if (!result.ok) {
          setBrandingNote(result.error);
          return;
        }
        const { branding } = result;
        if (branding.logoUrl && !manualLogo.current)
          setValue('logoUrl', branding.logoUrl, { shouldDirty: true });
        if (branding.color)
          setValue('brandColor', branding.color, { shouldDirty: true });
        if (branding.name && !getValues('name')?.trim())
          setValue('name', branding.name, { shouldDirty: true });
        setBrandingNote(
          branding.logoUrl
            ? 'Pulled in the logo and colour.'
            : 'Found a colour.',
        );
      } finally {
        setBrandingBusy(false);
      }
    }, 700);
    return () => clearTimeout(handle);
  }, [url, getValues, setValue]);

  const methodId = watch('methodId');
  const selectedMethod = methods.find((m) => m.id === methodId) ?? null;
  const showBank =
    selectedMethod != null && BANK_KINDS.has(selectedMethod.kind);
  /** A "manual" payment — one you send yourself, so a recipient method makes sense. */
  const showRecipientMethod =
    selectedMethod != null && !BANK_KINDS.has(selectedMethod.kind);

  /** Select a method, and drop the bank / recipient method if they no longer apply. */
  const pickMethod = (id: string | null) => {
    setValue('methodId', id, { shouldDirty: true });
    const kind = methods.find((m) => m.id === id)?.kind;
    if (!kind || !BANK_KINDS.has(kind)) {
      setValue('bankId', null, { shouldDirty: true });
    }
    if (!kind || BANK_KINDS.has(kind)) {
      setValue('recipientMethodId', null, { shouldDirty: true });
    }
  };

  const noun = isRecurring ? 'subscription' : 'payment';

  const runSave = async (
    values: PaymentFormValues,
    scopeArg?: { scope: 'this' | 'future'; occurrenceDate: string },
  ) => {
    const result = await savePaymentAction(
      initial?.id ?? null,
      values,
      scopeArg,
    );
    if (result.ok) {
      if (values.currency) writeLastCurrency(values.currency);
      onDone();
      return;
    }
    if (result.fieldErrors) {
      for (const [field, msgs] of Object.entries(result.fieldErrors)) {
        if (msgs[0])
          setError(field as keyof PaymentFormValues, { message: msgs[0] });
      }
    }
    setFormError(result.error);
    setPending(null);
  };

  const runDelete = async (scopeArg?: {
    scope: 'this' | 'future';
    occurrenceDate: string;
  }) => {
    if (!initial) return;
    const result = await deletePaymentAction(initial.id, scopeArg);
    if (result.ok) {
      onDone();
      return;
    }
    setFormError(result.error);
    setPending(null);
  };

  const confirmPending = async () => {
    if (!pending) return;
    setFormError(undefined);
    setBusy(true);
    try {
      const scopeArg =
        canScope && occurrenceDate
          ? { scope: confirmScope, occurrenceDate }
          : undefined;
      if (pending.action === 'save') await runSave(pending.values, scopeArg);
      else await runDelete(scopeArg);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    if (canScope) {
      setPending({ action: 'save', values });
      return;
    }
    await runSave(values);
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {formError ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <Field>
        <Label>Repeats</Label>
        <div className="flex flex-wrap gap-1.5">
          {RECURRENCES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setValue('recurrence', r, { shouldDirty: true });
                if (r === 'one_time') {
                  setValue('endsOn', null, { shouldDirty: true });
                  setValue('url', '', { shouldDirty: true });
                  setValue('logoUrl', '', { shouldDirty: true });
                  setValue('brandColor', '', { shouldDirty: true });
                }
              }}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                recurrence === r
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line-strong text-muted hover:text-ink',
              )}
            >
              {RECURRENCE_LABELS[r]}
            </button>
          ))}
        </div>
      </Field>

      {isRecurring ? (
        <Field>
          <Label htmlFor="url">Provider</Label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              aria-label={logoUrl ? 'Replace logo' : 'Upload a logo'}
              title={logoUrl ? 'Replace logo' : 'Upload a logo'}
              className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
            >
              {logoUrl ? (
                <img
                  src={String(logoUrl)}
                  alt=""
                  className="h-full w-full object-contain"
                />
              ) : (
                <ImagePlus size={15} strokeWidth={2} />
              )}
            </button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onLogoFile}
            />
            <Input
              id="url"
              type="url"
              inputMode="url"
              placeholder="netflix.com"
              className="flex-1"
              {...register('url')}
            />
            {brandingBusy ? <Spinner /> : null}
          </div>
          {logoError ? (
            <p className="text-xs text-danger">{logoError}</p>
          ) : fieldMessage(errors, 'url') ? (
            <p className="text-xs text-danger">{fieldMessage(errors, 'url')}</p>
          ) : brandingNote ? (
            <p className="text-xs text-muted">{brandingNote}</p>
          ) : (
            <p className="text-xs text-muted">
              Paste the provider’s site, or tap the icon to upload a logo.
            </p>
          )}
        </Field>
      ) : null}

      <Field>
        <Label htmlFor="name">Description</Label>
        <Input
          id="name"
          placeholder="Rent, Spotify, Car insurance…"
          {...register('name')}
        />
        {fieldMessage(errors, 'name') ? (
          <p className="text-xs text-danger">{fieldMessage(errors, 'name')}</p>
        ) : null}
      </Field>

      <Field>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="amount">
            {perUnit ? `Price per ${unitLabel}` : 'Amount'}
          </Label>
          <div className="flex gap-1">
            {(
              [
                ['fixed', 'Fixed'],
                ['per_unit', 'Per unit'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setValue('amountKind', value, { shouldDirty: true })
                }
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                  amountKind === value
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-line-strong text-muted hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Controller
          control={control}
          name="amount"
          render={({ field, fieldState }) => (
            <AmountField
              id="amount"
              amount={field.value ?? ''}
              onAmountChange={field.onChange}
              onAmountBlur={field.onBlur}
              currency={watch('currency') ?? defaultCurrency}
              onCurrencyChange={(c) =>
                setValue('currency', c, { shouldDirty: true })
              }
              usedCurrencies={usedCurrencies}
              invalid={!!fieldState.error}
            />
          )}
        />
        {fieldMessage(errors, 'amount') ? (
          <p className="text-xs text-danger">
            {fieldMessage(errors, 'amount')}
          </p>
        ) : null}
      </Field>

      {perUnit ? (
        <div className="flex gap-3">
          <Field className="flex-1">
            <Label htmlFor="unitName">Unit</Label>
            <Input
              id="unitName"
              placeholder="session, visit, hour…"
              {...register('unitName')}
            />
            {fieldMessage(errors, 'unitName') ? (
              <p className="text-xs text-danger">
                {fieldMessage(errors, 'unitName')}
              </p>
            ) : null}
          </Field>
          <Field className="w-32">
            <Label htmlFor="defaultUnits">
              {editingOccurrence ? 'This month' : 'Usual qty'}
            </Label>
            <Input
              id="defaultUnits"
              inputMode="decimal"
              placeholder="1"
              {...register('defaultUnits')}
            />
            {fieldMessage(errors, 'defaultUnits') ? (
              <p className="text-xs text-danger">
                {fieldMessage(errors, 'defaultUnits')}
              </p>
            ) : null}
          </Field>
        </div>
      ) : null}

      <Field>
        <div className="flex flex-wrap items-center gap-2">
          <Label>Fee (optional)</Label>
          <div className="flex gap-1">
            {(
              [
                ['none', 'None'],
                ['fixed', 'Fixed'],
                ['percent', '%'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setValue('feeKind', value, { shouldDirty: true })}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                  feeKind === value
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-line-strong text-muted hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {feeKind !== 'none' ? (
          <>
            <div className="flex items-center gap-2">
              <Input
                id="feeValue"
                inputMode="decimal"
                placeholder={feeKind === 'percent' ? '2.5' : '0.00'}
                className="w-32"
                {...register('feeValue')}
              />
              <span className="text-sm text-muted">
                {feeKind === 'percent'
                  ? `% of the amount`
                  : `${watch('currency') ?? defaultCurrency} on top`}
              </span>
            </div>
            <p className="text-xs text-muted">
              Added on top of the amount and rolled into the total.
            </p>
            {fieldMessage(errors, 'feeValue') ? (
              <p className="text-xs text-danger">
                {fieldMessage(errors, 'feeValue')}
              </p>
            ) : null}
          </>
        ) : null}
      </Field>

      {/*
        `anchorDate` stays mounted in both modes (toggling it would churn RHF's
        registration). One-time: a visible date field. Recurring: hidden — the
        effect keeps it in sync with the day-of-month.
      */}
      <Field className={cn(isRecurring && 'hidden')}>
        <Label htmlFor="anchorDate">Date</Label>
        <Input id="anchorDate" type="date" {...register('anchorDate')} />
        {!isRecurring && fieldMessage(errors, 'anchorDate') ? (
          <p className="text-xs text-danger">
            {fieldMessage(errors, 'anchorDate')}
          </p>
        ) : null}
      </Field>

      {isRecurring ? (
        <Field>
          <div className="flex flex-wrap items-start gap-3">
            <Field className="w-24">
              <Label htmlFor="dayOfMonth">Day of the month</Label>
              <Input
                id="dayOfMonth"
                type="number"
                min={1}
                max={31}
                inputMode="numeric"
                placeholder="1"
                {...register('dayOfMonth')}
              />
              {fieldMessage(errors, 'dayOfMonth') ? (
                <p className="text-xs text-danger">
                  {fieldMessage(errors, 'dayOfMonth')}
                </p>
              ) : null}
            </Field>
            <Field className="min-w-40 flex-1">
              <Label htmlFor="endsOn">Ends on (optional)</Label>
              <Input id="endsOn" type="date" {...register('endsOn')} />
              {fieldMessage(errors, 'endsOn') ? (
                <p className="text-xs text-danger">
                  {fieldMessage(errors, 'endsOn')}
                </p>
              ) : null}
            </Field>
          </div>
          <p className="text-xs text-muted">
            It repeats on this day each period.
          </p>
        </Field>
      ) : null}

      <Field>
        <Label>Payment method</Label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => pickMethod(null)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium',
              methodId == null
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-line-strong text-muted hover:text-ink',
            )}
          >
            None
          </button>
          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => pickMethod(m.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
                methodId === m.id
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line-strong text-muted hover:text-ink',
              )}
            >
              <MethodIcon iconKey={m.iconKey} logoUrl={m.logoUrl} />
              {m.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAddingMethod(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-3 py-1.5 text-xs font-medium text-muted hover:text-ink"
          >
            <Plus size={13} strokeWidth={3} />
            New method
          </button>
        </div>
      </Field>

      <ResponsiveModal
        open={addingMethod}
        onOpenChange={setAddingMethod}
        title="New payment method"
        description="It’s added to your methods and selected here."
      >
        <MethodForm
          onCancel={() => setAddingMethod(false)}
          onCreated={(method) => {
            setMethods((prev) => [...prev, method]);
            setValue('methodId', method.id, { shouldDirty: true });
            setAddingMethod(false);
          }}
        />
      </ResponsiveModal>

      {showBank ? (
        <Field>
          <Label>Bank</Label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setValue('bankId', null, { shouldDirty: true })}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium',
                watch('bankId') == null
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
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: b.color }}
                />
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
      ) : null}

      <ResponsiveModal
        open={addingBank}
        onOpenChange={setAddingBank}
        title="New bank"
        description="The bank behind this direct debit or card."
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

      {showRecipientMethod ? (
        <Field>
          <Label>Recipient method</Label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() =>
                setValue('recipientMethodId', null, { shouldDirty: true })
              }
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium',
                watch('recipientMethodId') == null
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line-strong text-muted hover:text-ink',
              )}
            >
              None
            </button>
            {recipientMethods.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() =>
                  setValue('recipientMethodId', r.id, { shouldDirty: true })
                }
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
                  watch('recipientMethodId') === r.id
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-line-strong text-muted hover:text-ink',
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: r.color }}
                />
                <MethodIcon iconKey={r.iconKey} logoUrl={r.logoUrl} />
                {r.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAddingRecipientMethod(true)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-3 py-1.5 text-xs font-medium text-muted hover:text-ink"
            >
              <Plus size={13} strokeWidth={3} />
              New recipient method
            </button>
          </div>
          <p className="text-xs text-muted">How you send this to the recipient.</p>
        </Field>
      ) : null}

      <ResponsiveModal
        open={addingRecipientMethod}
        onOpenChange={setAddingRecipientMethod}
        title="New recipient method"
        description="How money reaches the recipient — Wise, PayPal, cash…"
      >
        <RecipientMethodForm
          onCancel={() => setAddingRecipientMethod(false)}
          onCreated={(recipientMethod) => {
            setRecipientMethods((prev) => [...prev, recipientMethod]);
            setValue('recipientMethodId', recipientMethod.id, {
              shouldDirty: true,
            });
            setAddingRecipientMethod(false);
          }}
        />
      </ResponsiveModal>

      <Field>
        <Label>Account</Label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setValue('accountId', null, { shouldDirty: true })}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium',
              watch('accountId') == null
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
              onClick={() => setValue('accountId', a.id, { shouldDirty: true })}
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
        description="A group your payments belong to — a company, a bill type, taxes…"
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
        <Label htmlFor="notes">Notes (optional)</Label>
        <textarea
          id="notes"
          rows={3}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          data-form-type="other"
          placeholder="Anything worth remembering about this payment…"
          className="rounded-md border border-line-strong bg-ground px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          {...register('notes')}
        />
        {fieldMessage(errors, 'notes') ? (
          <p className="text-xs text-danger">{fieldMessage(errors, 'notes')}</p>
        ) : null}
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <div className="flex flex-col items-start gap-0.5">
          {initial ? (
            <button
              type="button"
              onClick={() => setPending({ action: 'delete' })}
              className="text-xs font-medium text-danger hover:underline"
            >
              Delete {noun}
            </button>
          ) : null}
          {hasOverride ? (
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting}
              className="text-xs font-medium text-muted hover:text-ink"
            >
              {resetting ? 'Resetting…' : 'Reset this month’s changes'}
            </button>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Saving…'
              : initial
                ? 'Save changes'
                : 'Add payment'}
          </Button>
        </div>
      </div>

      <ConfirmScopeModal
        pending={pending}
        noun={noun}
        canScope={canScope}
        scope={confirmScope}
        onScopeChange={setConfirmScope}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={confirmPending}
      />
    </form>
  );
}

function ConfirmScopeModal({
  pending,
  noun,
  canScope,
  scope,
  onScopeChange,
  busy,
  onCancel,
  onConfirm,
}: {
  pending: null | { action: 'save' } | { action: 'delete' };
  noun: string;
  canScope: boolean;
  scope: 'this' | 'future';
  onScopeChange: (s: 'this' | 'future') => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isDelete = pending?.action === 'delete';
  return (
    <ResponsiveModal
      open={pending != null}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
      title={isDelete ? `Delete ${noun}` : 'Save changes'}
    >
      <div className="flex flex-col gap-4">
        {canScope ? (
          <>
            <p className="text-sm text-ink-soft">
              This {noun} repeats.{' '}
              {isDelete ? 'Delete:' : 'Apply your changes to:'}
            </p>
            <div className="flex flex-col gap-2">
              {(
                [
                  [
                    'this',
                    'This month only',
                    'Just the occurrence you opened; other months keep the series settings.',
                  ],
                  [
                    'future',
                    'This and following months',
                    'This occurrence and every later one. Earlier months stay unchanged.',
                  ],
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={scope === value}
                  onClick={() => onScopeChange(value)}
                  className={cn(
                    'flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left',
                    scope === value
                      ? 'border-accent bg-accent/10'
                      : 'border-line-strong hover:border-line',
                  )}
                >
                  <span className="text-sm font-medium text-ink">{label}</span>
                  <span className="text-xs text-muted">{hint}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            {isDelete
              ? `Delete this ${noun}? Earlier months are kept.`
              : `Save your changes to this ${noun}?`}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={isDelete ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy
              ? isDelete
                ? 'Deleting…'
                : 'Saving…'
              : isDelete
                ? 'Delete'
                : 'Save changes'}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
