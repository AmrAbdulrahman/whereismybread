'use client';

import { useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  AmountField,
  Button,
  Field,
  Input,
  Label,
  cn,
  fileToLogoDataUrl,
} from '@wib/ui';
import { ImagePlus } from '@wib/ui/icons';
import { saveThingAction } from '../lib/actions';
import { thingFormSchema, type ThingFormValues } from '../lib/schema';
import type { ThingView } from '../lib/types';

export function ThingForm({
  initial,
  defaultCurrency = 'EUR',
  usedCurrencies = [],
  onDone,
  onCancel,
}: {
  initial?: ThingView;
  defaultCurrency?: string;
  usedCurrencies?: string[];
  onDone: (thing: ThingView) => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string>();
  const [logoError, setLogoError] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ThingFormValues>({
    resolver: zodResolver(thingFormSchema),
    mode: 'onTouched',
    defaultValues: {
      name: initial?.name ?? '',
      logoUrl: initial?.logoUrl ?? null,
      unit: initial?.unit ?? 'piece',
      value: initial ? (initial.valueMinor / 100).toFixed(2) : '',
      valueCurrency: initial?.valueCurrency ?? defaultCurrency,
    },
  });

  const logoUrl = watch('logoUrl') as string | null;
  const unit = watch('unit') ?? 'piece';
  const value = watch('value') ?? '';
  const valueCurrency = watch('valueCurrency') ?? defaultCurrency;

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    setLogoError(undefined);
    try {
      const uri = await fileToLogoDataUrl(file, { max: 160, budget: 380_000 });
      setValue('logoUrl', uri, { shouldDirty: true });
    } catch (error) {
      setLogoError(
        error instanceof Error ? error.message : 'Could not read that image.',
      );
    }
  };

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await saveThingAction(initial?.id ?? null, values);
    if (result.ok && result.thing) {
      onDone(result.thing);
      return;
    }
    for (const [field, msgs] of Object.entries(result.fieldErrors ?? {})) {
      if (msgs[0]) setError(field as keyof ThingFormValues, { message: msgs[0] });
    }
    setFormError(result.error);
  });

  return (
    <form
      onSubmit={(e) => {
        e.stopPropagation();
        void submit(e);
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      {formError ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-line-strong bg-surface-2 text-muted hover:text-ink"
          aria-label="Add a logo"
        >
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus size={18} strokeWidth={2} />
          )}
        </button>
        <input
          ref={fileRef}
          id="thing-logo"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void pickLogo(e.target.files?.[0])}
        />
        <div className="text-xs text-muted">
          A logo is optional.
          {logoUrl ? (
            <button
              type="button"
              onClick={() => setValue('logoUrl', null, { shouldDirty: true })}
              className="ml-2 font-medium text-ink underline-offset-2 hover:underline"
            >
              Remove
            </button>
          ) : null}
          {logoError ? <p className="mt-0.5 text-danger">{logoError}</p> : null}
        </div>
      </div>

      <Field>
        <Label htmlFor="thing-name">Name</Label>
        <Input
          id="thing-name"
          placeholder="Rolex Submariner, 22K bangle…"
          {...register('name')}
        />
        {errors.name?.message ? (
          <p className="text-xs text-danger">{errors.name.message}</p>
        ) : null}
      </Field>

      <Field>
        <Label>Counted in</Label>
        <div className="flex gap-1">
          {(
            [
              ['piece', 'Pieces'],
              ['g', 'Grams'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setValue('unit', v, { shouldDirty: true })}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                unit === v
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
        <Label htmlFor="thing-value">Reference value per {unit === 'g' ? 'gram' : 'piece'} (optional)</Label>
        <AmountField
          id="thing-value"
          amount={value}
          onAmountChange={(v) => setValue('value', v, { shouldDirty: true })}
          currency={valueCurrency}
          onCurrencyChange={(c) =>
            setValue('valueCurrency', c, { shouldDirty: true })
          }
          usedCurrencies={usedCurrencies}
          invalid={!!errors.value}
        />
        <p className="text-[11px] text-muted">
          Used only to show an approximate total in your currency.
        </p>
        {errors.value?.message ? (
          <p className="text-xs text-danger">{errors.value.message}</p>
        ) : null}
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : initial ? 'Save changes' : 'Add thing'}
        </Button>
      </div>
    </form>
  );
}
