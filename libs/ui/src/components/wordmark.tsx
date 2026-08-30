import { BreadMark } from '../icons/brand';
import { cn } from '../lib/cn';

/** The loaf mark + "where is my bread" lockup, two-tone like the logo. */
export function Wordmark({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md';
}) {
  const mark = size === 'sm' ? 22 : 26;
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <BreadMark size={mark} className="text-accent" />
      <span
        className={cn(
          'font-display font-bold tracking-tight',
          size === 'sm' ? 'text-[14px]' : 'text-[15px]',
        )}
      >
        <span className="text-ink">where is my </span>
        <span className="text-accent">bread</span>
      </span>
    </span>
  );
}
