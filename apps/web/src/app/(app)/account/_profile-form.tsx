'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  updateProfileAction,
  updateProfileSchema,
  type UpdateProfileInput,
} from '@wib/auth';
import { Button, Field, Input, Label } from '@wib/ui';
import { applyServerErrors } from '../../_components/apply-server-errors';

export function ProfileForm({
  name,
  email,
}: {
  name: string | null;
  email: string;
}) {
  const [message, setMessage] = useState<string>();
  const [formError, setFormError] = useState<string>();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: name ?? '' },
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async (values) => {
    setMessage(undefined);
    setFormError(undefined);
    const result = await updateProfileAction(values);
    if (result.ok) setMessage(result.message);
    else setFormError(applyServerErrors(setError, result));
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field>
        <Label htmlFor="name">Name</Label>
        <Input id="name" autoComplete="name" {...register('name')} />
        {errors.name?.message ? (
          <p className="text-xs text-danger">{errors.name.message}</p>
        ) : null}
      </Field>
      <Field>
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} disabled readOnly />
        <p className="text-xs text-muted">Changing your email comes later.</p>
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
        {message ? <span className="text-sm text-teal">{message}</span> : null}
        {formError ? (
          <span className="text-sm text-danger">{formError}</span>
        ) : null}
      </div>
    </form>
  );
}
