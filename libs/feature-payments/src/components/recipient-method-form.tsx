'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { RecipientMethod } from '@wib/db';
import {
  Button,
  ColorPicker,
  COLOR_PALETTE,
  Field,
  Input,
  Label,
} from '@wib/ui';
import { createRecipientMethodAction } from '../lib/actions';
import {
  recipientMethodFormSchema,
  type RecipientMethodFormValues,
} from '../lib/recipient-method-schema';
import { MethodMarkPicker } from './method-mark-picker';

export function RecipientMethodForm({
  onCreated,
  onCancel,
}: {
  onCreated: (recipientMethod: RecipientMethod) => void;
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
  } = useForm<RecipientMethodFormValues>({
    resolver: zodResolver(recipientMethodFormSchema),
    mode: 'onTouched',
    defaultValues: {
      name: '',
      iconKey: 'transfer',
      logoUrl: null,
      color: COLOR_PALETTE[0],
    },
  });

  const iconKey = watch('iconKey');
  const logoUrl = watch('logoUrl');
  const color = watch('color');

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await createRecipientMethodAction(values);
    if (result.ok && result.recipientMethod) {
      onCreated(result.recipientMethod);
      return;
    }
    if (result.fieldErrors) {
      for (const [field, msgs] of Object.entries(result.fieldErrors)) {
        if (msgs[0]) {
          setError(field as keyof RecipientMethodFormValues, {
            message: msgs[0],
          });
        }
      }
    }
    setFormError(result.error);
  });

  return (
    <form
      onSubmit={(e) => {
        // Portaled into the payment form's React tree — stop the submit event
        // bubbling up and triggering the outer form.
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
        <Label htmlFor="recipient-method-name">Name</Label>
        <Input
          id="recipient-method-name"
          placeholder="Wise, PayPal, Revolut, cash…"
          {...register('name')}
        />
        {errors.name?.message ? (
          <p className="text-xs text-danger">{errors.name.message}</p>
        ) : null}
      </Field>

      <MethodMarkPicker
        iconKey={iconKey ?? 'transfer'}
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
          {isSubmitting ? 'Adding…' : 'Add recipient method'}
        </Button>
      </div>
    </form>
  );
}
