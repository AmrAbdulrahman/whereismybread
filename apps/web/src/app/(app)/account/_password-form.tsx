'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  changePasswordAction,
  changePasswordSchema,
  type ChangePasswordInput,
} from '@wib/auth';
import { Button, Field, Input, Label } from '@wib/ui';
import { applyServerErrors } from '../../_components/apply-server-errors';

export function PasswordForm() {
  const [message, setMessage] = useState<string>();
  const [formError, setFormError] = useState<string>();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async (values) => {
    setMessage(undefined);
    setFormError(undefined);
    const result = await changePasswordAction(values);
    if (result.ok) {
      setMessage(result.message);
      reset();
    } else {
      setFormError(applyServerErrors(setError, result));
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field>
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          {...register('currentPassword')}
        />
        {errors.currentPassword?.message ? (
          <p className="text-xs text-danger">
            {errors.currentPassword.message}
          </p>
        ) : null}
      </Field>
      <Field>
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          {...register('newPassword')}
        />
        {errors.newPassword?.message ? (
          <p className="text-xs text-danger">{errors.newPassword.message}</p>
        ) : null}
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={isSubmitting}>
          {isSubmitting ? 'Changing…' : 'Change password'}
        </Button>
        {message ? <span className="text-sm text-teal">{message}</span> : null}
        {formError ? (
          <span className="text-sm text-danger">{formError}</span>
        ) : null}
      </div>
    </form>
  );
}
