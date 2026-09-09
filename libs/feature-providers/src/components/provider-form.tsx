'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import {
  Button,
  ColorPicker,
  COLOR_PALETTE,
  Field,
  Input,
  Label,
  type TagOption,
} from '@wib/ui';
import { saveProviderAction, type ProviderRow } from '../lib/actions';
import { providerFormSchema, type ProviderFormValues } from '../lib/schema';
import { ProviderMarkEditor } from './provider-mark-editor';

/**
 * Create (or edit) a provider. Used standalone by the /providers page's
 * on-the-fly flows and inside the payment / expense / automation pickers when
 * the user makes a new provider without leaving the form they're in.
 */
export function ProviderForm({
  id = null,
  initial,
  tags,
  onSaved,
  onCancel,
}: {
  id?: string | null;
  initial?: Partial<ProviderFormValues>;
  tags: TagOption[];
  onSaved: (row: ProviderRow) => void;
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
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProviderFormValues>({
    resolver: zodResolver(providerFormSchema),
    mode: 'onTouched',
    defaultValues: {
      name: initial?.name ?? '',
      url: initial?.url ?? '',
      logoUrl: initial?.logoUrl ?? null,
      color: initial?.color ?? COLOR_PALETTE[0],
      defaultTags: initial?.defaultTags ?? [],
    },
  });

  const url = watch('url');
  const logoUrl = watch('logoUrl');
  const color = watch('color');

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await saveProviderAction(id, {
      name: values.name,
      color: (values.color as string | null) ?? COLOR_PALETTE[0],
      mark: {
        url: (values.url as string | null) ?? null,
        logoUrl: (values.logoUrl as string | null) ?? null,
        defaultTags: values.defaultTags ?? [],
      },
    });
    if (result.ok && result.item) {
      onSaved(result.item);
      return;
    }
    for (const [field, msgs] of Object.entries(result.fieldErrors ?? {})) {
      if (msgs[0]) setError(field as keyof ProviderFormValues, { message: msgs[0] });
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
        <Label htmlFor="provider-name">Name</Label>
        <Input
          id="provider-name"
          placeholder="Netflix, the landlord, the gym…"
          {...register('name')}
        />
        {errors.name?.message ? (
          <p className="text-xs text-danger">{errors.name.message}</p>
        ) : null}
      </Field>

      <Controller
        control={control}
        name="defaultTags"
        render={({ field }) => (
          <ProviderMarkEditor
            url={(url as string | null) ?? ''}
            logoUrl={(logoUrl as string | null) ?? null}
            color={(color as string | null) ?? null}
            defaultTags={field.value ?? []}
            onUrlChange={(v) => setValue('url', v, { shouldDirty: true })}
            onLogoUrlChange={(v) =>
              setValue('logoUrl', v, { shouldDirty: true })
            }
            onColorChange={(v) => setValue('color', v, { shouldDirty: true })}
            onDefaultTagsChange={(v) => field.onChange(v)}
            onNameSuggest={(n) => {
              if (!getValues('name')?.trim())
                setValue('name', n, { shouldDirty: true });
            }}
            tagOptions={tags}
          />
        )}
      />

      <Field>
        <Label>Colour</Label>
        <ColorPicker
          value={(color as string | null) ?? COLOR_PALETTE[0]}
          onChange={(c) => setValue('color', c, { shouldDirty: true })}
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : id ? 'Save provider' : 'Add provider'}
        </Button>
      </div>
    </form>
  );
}
