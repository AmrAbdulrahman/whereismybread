'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { Bank } from '@wib/db';
import {
  Button,
  ColorPicker,
  COLOR_PALETTE,
  Field,
  Input,
  Label,
} from '@wib/ui';
import { createBankAction } from '../lib/actions';
import { bankFormSchema, type BankFormValues } from '../lib/bank-schema';

export function BankForm({
  onCreated,
  onCancel,
}: {
  onCreated: (bank: Bank) => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string>();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BankFormValues>({
    resolver: zodResolver(bankFormSchema),
    mode: 'onTouched',
    defaultValues: { name: '', color: COLOR_PALETTE[0] },
  });

  const color = watch('color');

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await createBankAction(values);
    if (result.ok && result.bank) {
      onCreated(result.bank);
      return;
    }
    if (result.fieldErrors) {
      for (const [field, msgs] of Object.entries(result.fieldErrors)) {
        if (msgs[0])
          setError(field as keyof BankFormValues, { message: msgs[0] });
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
        <Label htmlFor="bank-name">Name</Label>
        <Input
          id="bank-name"
          placeholder="Monzo, HSBC, Revolut…"
          {...register('name')}
        />
        {errors.name?.message ? (
          <p className="text-xs text-danger">{errors.name.message}</p>
        ) : null}
      </Field>

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
          {isSubmitting ? 'Adding…' : 'Add bank'}
        </Button>
      </div>
    </form>
  );
}
