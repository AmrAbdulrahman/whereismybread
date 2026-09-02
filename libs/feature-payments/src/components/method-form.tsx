'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { PaymentMethod } from '@wib/db';
import { PAYMENT_METHOD_KINDS, type PaymentMethodKind } from '@wib/domain';
import {
  Button,
  ColorPicker,
  COLOR_PALETTE,
  Field,
  Input,
  Label,
} from '@wib/ui';
import { createMethodAction } from '../lib/actions';
import { methodFormSchema, type MethodFormValues } from '../lib/method-schema';
import { MethodMarkPicker } from './method-mark-picker';

const KIND_LABELS: Record<PaymentMethodKind, string> = {
  direct_debit: 'Direct debit',
  credit_card: 'Card',
  cash: 'Cash',
  manual_transfer: 'Manual transfer',
};

export function MethodForm({
  onCreated,
  onCancel,
}: {
  onCreated: (method: PaymentMethod) => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string>();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MethodFormValues>({
    resolver: zodResolver(methodFormSchema),
    mode: 'onTouched',
    defaultValues: {
      name: '',
      kind: 'manual_transfer',
      iconKey: 'wallet',
      logoUrl: null,
      color: COLOR_PALETTE[0],
    },
  });

  const iconKey = watch('iconKey');
  const logoUrl = watch('logoUrl');
  const color = watch('color');

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await createMethodAction(values);
    if (result.ok && result.method) {
      onCreated(result.method);
      return;
    }
    if (result.fieldErrors) {
      for (const [field, msgs] of Object.entries(result.fieldErrors)) {
        if (msgs[0])
          setError(field as keyof MethodFormValues, { message: msgs[0] });
      }
    }
    setFormError(result.error);
  });

  return (
    <form
      onSubmit={(e) => {
        // Portaled into the payment form's React tree — stop the submit
        // event bubbling up and triggering the outer form.
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

      <Field>
        <Label htmlFor="method-name">Name</Label>
        <Input
          id="method-name"
          placeholder="Revolut, Joint account…"
          {...register('name')}
        />
        {errors.name?.message ? (
          <p className="text-xs text-danger">{errors.name.message}</p>
        ) : null}
      </Field>

      <Field>
        <Label htmlFor="method-kind">Type</Label>
        <select
          id="method-kind"
          {...register('kind')}
          className="h-10 rounded-md border border-line-strong bg-ground px-2 text-sm text-ink"
        >
          {PAYMENT_METHOD_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>

      <MethodMarkPicker
        iconKey={iconKey ?? 'wallet'}
        logoUrl={(logoUrl as string | null | undefined) ?? null}
        onIconChange={(k) => setValue('iconKey', k, { shouldDirty: true })}
        onLogoChange={(uri) =>
          setValue('logoUrl', uri, { shouldDirty: true })
        }
        onColorChange={(hex) => setValue('color', hex, { shouldDirty: true })}
        onNameSuggest={(n) => {
          if (!getValues('name')?.trim()) {
            setValue('name', n, { shouldDirty: true });
          }
        }}
      />

      <Field>
        <Label>Colour</Label>
        <ColorPicker
          value={color ?? COLOR_PALETTE[0]}
          onChange={(c) => setValue('color', c, { shouldDirty: true })}
        />
        {errors.color?.message ? (
          <p className="text-xs text-danger">{errors.color.message}</p>
        ) : null}
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Adding…' : 'Add method'}
        </Button>
      </div>
    </form>
  );
}
