'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  requestPasswordResetAction,
  requestResetSchema,
  type RequestResetInput,
} from '@wib/auth';
import { AuthShell, Link } from '../_components/auth-shell';
import { applyServerErrors } from '../../_components/apply-server-errors';
import {
  FormAlert,
  FormMessage,
  SubmitButton,
  TextField,
} from '../_components/form-bits';

export default function ForgotPasswordPage() {
  const [formError, setFormError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RequestResetInput>({
    resolver: zodResolver(requestResetSchema),
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await requestPasswordResetAction(values);
    if (result.ok) setMessage(result.message);
    else setFormError(applyServerErrors(setError, result));
  });

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We’ll email you a link to choose a new one."
      footer={<Link href="/login">Back to sign in</Link>}
    >
      {message ? (
        <FormMessage message={message} />
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <FormAlert message={formError} />
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <SubmitButton pending={isSubmitting}>Send reset link</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
