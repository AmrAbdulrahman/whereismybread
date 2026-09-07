'use client';

import { useState, useTransition } from 'react';
import { resendVerificationAction } from '@wib/auth';
import { Button } from '@wib/ui';

export function VerifyEmailNotice() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();

  const resend = () =>
    startTransition(async () => {
      const result = await resendVerificationAction();
      setMessage(result.message ?? result.error);
    });

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warn/40 bg-warn/10 p-4">
      <p className="text-sm font-medium text-ink">Confirm your email address</p>
      <p className="text-[13px] text-ink-soft">
        We sent a confirmation link when you signed up. Some features that email
        you will stay off until it&rsquo;s confirmed.
      </p>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={resend}
        >
          {pending ? 'Sending…' : 'Resend link'}
        </Button>
        {message ? (
          <span className="text-[13px] text-teal">{message}</span>
        ) : null}
      </div>
    </div>
  );
}
