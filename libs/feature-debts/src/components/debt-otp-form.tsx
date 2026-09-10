'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Label, Wordmark } from '@wib/ui';
import { requestDebtOtpAction, verifyDebtOtpAction } from '../lib/share-actions';

export function DebtOtpForm({ shareId }: { shareId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const result = await requestDebtOtpAction(shareId, { email });
      if (!result.ok) {
        setError(result.error ?? 'Enter a valid email address.');
        return;
      }
      setMessage(result.message);
      setStep('code');
      if (result.devCode) setCode(result.devCode);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const result = await verifyDebtOtpAction(shareId, { email, code });
      if (!result.ok) {
        setError(result.error ?? 'That code is not right.');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Wordmark />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">A debt was shared with you</h1>
        <p className="text-sm text-ink-soft">
          {step === 'email'
            ? 'Confirm the email this was sent to and we’ll send a one-time code.'
            : `Enter the 6-digit code we sent to ${email}.`}
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      {step === 'email' ? (
        <form onSubmit={requestCode} className="flex flex-col gap-4" noValidate>
          <Field>
            <Label htmlFor="otp-email">Email</Label>
            <Input
              id="otp-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Sending…' : 'Send me a code'}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
          {message ? (
            <p className="rounded-md border border-teal/40 bg-teal/10 px-3 py-2 text-sm text-teal">
              {message}
            </p>
          ) : null}
          <Field>
            <Label htmlFor="otp-code">Code</Label>
            <Input
              id="otp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
            />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Checking…' : 'View the debt'}
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep('email');
              setCode('');
              setMessage(undefined);
              setError(undefined);
            }}
            className="text-xs text-muted underline-offset-2 hover:underline"
          >
            Use a different email
          </button>
        </form>
      )}
    </div>
  );
}
