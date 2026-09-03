'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { FormState } from '@wib/auth';
import {
  Button,
  ColorPicker,
  COLOR_PALETTE,
  Field,
  Input,
  Label,
} from '@wib/ui';
import { accountFormSchema, type AccountFormValues } from '../lib/account-schema';
import type { LabelRow } from '../lib/actions';

/** The name + colour form behind the accounts / banks managers. */
export function LabelForm({
  noun,
  placeholder,
  initial,
  onSave,
  onSaved,
  onCancel,
}: {
  noun: string;
  placeholder: string;
  initial?: Pick<LabelRow, 'id' | 'name' | 'color'>;
  onSave: (
    id: string | null,
    values: AccountFormValues,
  ) => Promise<FormState & { item?: LabelRow }>;
  onSaved: (item: LabelRow) => void;
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
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    mode: 'onTouched',
    defaultValues: {
      name: initial?.name ?? '',
      color: initial?.color ?? COLOR_PALETTE[0],
    },
  });

  const color = watch('color');

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await onSave(initial?.id ?? null, values);
    if (result.ok && result.item) {
      onSaved(result.item);
      return;
    }
    if (result.fieldErrors) {
      for (const [field, msgs] of Object.entries(result.fieldErrors)) {
        if (msgs[0])
          setError(field as keyof AccountFormValues, { message: msgs[0] });
      }
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

      <Field>
        <Label htmlFor="label-name">Name</Label>
        <Input
          id="label-name"
          autoFocus
          placeholder={placeholder}
          {...register('name')}
        />
        {errors.name?.message ? (
          <p className="text-xs text-danger">{errors.name.message}</p>
        ) : null}
      </Field>

      <Field>
        <Label>Colour</Label>
        <span
          className="inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            background: `${color ?? COLOR_PALETTE[0]}22`,
            color: color ?? COLOR_PALETTE[0],
          }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: color ?? COLOR_PALETTE[0] }}
          />
          {watch('name')?.trim() || 'Preview'}
        </span>
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
          {isSubmitting
            ? 'Saving…'
            : initial
              ? 'Save changes'
              : `Add ${noun}`}
        </Button>
      </div>
    </form>
  );
}
