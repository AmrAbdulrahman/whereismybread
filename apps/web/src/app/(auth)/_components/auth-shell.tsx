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
      <div className="flex flex-col gap-1.5">
        <Wordmark />
        <span className="pl-[34px] font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          plan &middot; track &middot; grow
        </span>
      </div>
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
