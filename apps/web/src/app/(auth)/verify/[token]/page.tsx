import Link from 'next/link';
import { verifyEmailAction } from '@wib/auth';
import { Button } from '@wib/ui';
import { AuthShell } from '../../_components/auth-shell';

export const metadata = { title: 'Confirm your email' };

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { ok } = await verifyEmailAction(token);

  return (
    <AuthShell title={ok ? 'Email confirmed' : 'Link expired'}>
      <p className="text-sm text-ink-soft">
        {ok
          ? 'Your email address is confirmed. You’re all set.'
          : 'That confirmation link is invalid or has already been used. You can send a new one from your account.'}
      </p>
      <Button asChild className="w-full">
        <Link href={ok ? '/plan' : '/account'}>
          {ok ? 'Go to the app' : 'Open account'}
        </Link>
      </Button>
    </AuthShell>
  );
}
