'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { loginAction, signInSchema, type SignInInput } from '@wib/auth';
import { AuthShell, Link } from '../_components/auth-shell';
import { applyServerErrors } from '../../_components/apply-server-errors';
import {
  FormAlert,
  FormMessage,
  SubmitButton,
  TextField,
} from '../_components/form-bits';

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') ?? undefined;
  const [formError, setFormError] = useState<string>();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await loginAction(values, next);
    if (!result.ok) setFormError(applyServerErrors(setError, result));
  });

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back."
      footer={
        <>
          New here? <Link href="/signup">Create an account</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {params.get('reset') === '1' ? (
          <FormMessage message="Password updated — sign in with your new password." />
        ) : null}
        <FormAlert message={formError} />
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
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs">
            Forgot your password?
          </Link>
        </div>
        <SubmitButton pending={isSubmitting}>Sign in</SubmitButton>
      </form>
    </AuthShell>
  );
}
