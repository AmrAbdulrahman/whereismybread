import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from '@wib/ui';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Wordmark slogan />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle ? <p className="text-sm text-ink-soft">{subtitle}</p> : null}
      </div>
      {children}
      {footer ? <div className="text-sm text-ink-soft">{footer}</div> : null}
    </div>
  );
}

export { Link };
