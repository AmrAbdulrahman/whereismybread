'use client';

import { useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button, Field, Input, Label, fileToLogoDataUrl } from '@wib/ui';
import { ImagePlus } from '@wib/ui/icons';
import { savePersonAction } from '../lib/actions';
import { personFormSchema, type PersonFormValues } from '../lib/schema';
import type { PersonView } from '../lib/types';

export function PersonForm({
  initial,
  onDone,
  onCancel,
}: {
  initial?: PersonView;
  onDone: (person: PersonView) => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string>();
  const [photoError, setPhotoError] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PersonFormValues>({
    resolver: zodResolver(personFormSchema),
    mode: 'onTouched',
    defaultValues: {
      name: initial?.name ?? '',
      email: initial?.email ?? '',
      photoUrl: initial?.photoUrl ?? null,
    },
  });

  const photoUrl = watch('photoUrl') as string | null;

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(undefined);
    try {
      const uri = await fileToLogoDataUrl(file, { max: 160, budget: 380_000 });
      setValue('photoUrl', uri, { shouldDirty: true });
    } catch (error) {
      setPhotoError(
        error instanceof Error ? error.message : 'Could not read that image.',
      );
    }
  };

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await savePersonAction(initial?.id ?? null, values);
    if (result.ok && result.person) {
      onDone(result.person);
      return;
    }
    for (const [field, msgs] of Object.entries(result.fieldErrors ?? {})) {
      if (msgs[0]) setError(field as keyof PersonFormValues, { message: msgs[0] });
    }
    setFormError(result.error);
  });

  return (
    <form
      onSubmit={(e) => {
        // Portalled into the debt form's tree — stop the submit bubbling up.
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
          className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-line-strong bg-surface-2 text-muted hover:text-ink"
          aria-label="Add a photo"
        >
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <ImagePlus size={18} strokeWidth={2} />
          )}
        </button>
        <input
          ref={fileRef}
          id="person-photo"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void pickPhoto(e.target.files?.[0])}
        />
        <div className="text-xs text-muted">
          A photo is optional.
          {photoUrl ? (
            <button
              type="button"
              onClick={() => setValue('photoUrl', null, { shouldDirty: true })}
              className="ml-2 font-medium text-ink underline-offset-2 hover:underline"
            >
              Remove
            </button>
          ) : null}
          {photoError ? (
            <p className="mt-0.5 text-danger">{photoError}</p>
          ) : null}
        </div>
      </div>

      <Field>
        <Label htmlFor="person-name">Name</Label>
        <Input
          id="person-name"
          placeholder="Sarah Cole"
          {...register('name')}
        />
        {errors.name?.message ? (
          <p className="text-xs text-danger">{errors.name.message}</p>
        ) : null}
      </Field>

      <Field>
        <Label htmlFor="person-email">Email</Label>
        <Input
          id="person-email"
          type="email"
          autoComplete="email"
          placeholder="sarah@example.com"
          {...register('email')}
        />
        <p className="text-[11px] text-muted">
          They&apos;ll get a link here to view the debt — no sign-up, just a
          one-time code.
        </p>
        {errors.email?.message ? (
          <p className="text-xs text-danger">{errors.email.message}</p>
        ) : null}
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : initial ? 'Save changes' : 'Add person'}
        </Button>
      </div>
    </form>
  );
}
