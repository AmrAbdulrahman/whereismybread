'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { registerAction, signUpSchema, type SignUpInput } from '@wib/auth';
import { AuthShell, Link } from '../_components/auth-shell';
import { applyServerErrors } from '../../_components/apply-server-errors';
import { FormAlert, SubmitButton, TextField } from '../_components/form-bits';

export default function SignupPage() {
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    let timezone: string | undefined;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch {
      timezone = undefined;
    }
    const result = await registerAction({ ...values, timezone });
    if (!result.ok) setFormError(applyServerErrors(setError, result));
  });

  return (
    <AuthShell
      title="Create your account"
      subtitle="Plan your money in one place."
      footer={
        <>
          Already have an account? <Link href="/login">Sign in</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormAlert message={formError} />
        <TextField
          label="Name"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <p className="text-xs text-muted">
          At least 8 characters. We check it against known breached passwords.
        </p>
        <SubmitButton pending={isSubmitting}>Create account</SubmitButton>
      </form>
    </AuthShell>
  );
}
