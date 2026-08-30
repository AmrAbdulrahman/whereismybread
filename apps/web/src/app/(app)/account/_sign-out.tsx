'use client';

import { signOutAction } from '@wib/auth';
import { Button } from '@wib/ui';

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="secondary">
        Sign out
      </Button>
    </form>
  );
}
