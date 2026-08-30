'use client';

import { use, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  newPasswordSchema,
  resetPasswordAction,
  type NewPasswordInput,
} from '@wib/auth';
import { AuthShell, Link } from '../../_components/auth-shell';
import { applyServerErrors } from '../../../_components/apply-server-errors';
import {
  FormAlert,
  SubmitButton,
  TextField,
} from '../../_components/form-bits';

export default function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [formError, setFormError] = useState<string>();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordInput>({
    resolver: zodResolver(newPasswordSchema),
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await resetPasswordAction(token, values);
    if (!result.ok) setFormError(applyServerErrors(setError, result));
  });

  return (
    <AuthShell
      title="Choose a new password"
      footer={<Link href="/login">Back to sign in</Link>}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormAlert message={formError} />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <p className="text-xs text-muted">At least 8 characters.</p>
        <SubmitButton pending={isSubmitting}>Update password</SubmitButton>
      </form>
    </AuthShell>
  );
}
