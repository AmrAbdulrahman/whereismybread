import { BreadSlice } from '../icons/brand';
import { cn } from '../lib/cn';

/** "Same bread, smarter finances." — the current brand line. */
export const SLOGAN = 'Same bread, smarter finances.';

type Size = 'sm' | 'md' | 'lg';
type Tone = 'auto' | 'light';

const MARK: Record<Size, number> = { sm: 22, md: 44, lg: 60 };

/**
 * The bread mark + "Where Is My / Bread" lockup.
 *
 * - `sm` — one compact line (sidebar, inline).
 * - `md` / `lg` — the stacked lockup from the brand sheet: mark on the left,
 *   "Where Is My" over a bold "Bread".
 *
 * `tone="light"` forces white text for dark/brand-purple grounds; the default
 * tracks the theme via `text-ink`. Pass `slogan` to render the tagline beneath.
 */
export function Wordmark({
  className,
  size = 'md',
  tone = 'auto',
  slogan = false,
}: {
  className?: string;
  size?: Size;
  tone?: Tone;
  slogan?: boolean;
}) {
  const text = tone === 'light' ? 'text-white' : 'text-ink';
  const sub = tone === 'light' ? 'text-white/70' : 'text-muted';

  if (size === 'sm') {
    return (
      <span className={cn('inline-flex items-center gap-2', className)}>
        <BreadSlice size={MARK.sm} />
        <span
          className={cn('font-display text-[15px] tracking-tight', text)}
        >
          <span className="font-medium">Where Is My </span>
          <span className="font-bold">Bread</span>
        </span>
      </span>
    );
  }

  const lockup = size === 'lg' ? 'text-[40px]' : 'text-[28px]';
  const line1 = size === 'lg' ? 'text-[19px]' : 'text-[13.5px]';

  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <BreadSlice size={MARK[size]} className="shrink-0" />
      <span className="flex flex-col">
        <span
          className={cn(
            'font-display font-medium leading-none tracking-tight',
            line1,
            text,
          )}
        >
          Where Is My
        </span>
        <span
          className={cn(
            'font-display font-bold leading-[1.05] tracking-tight',
            lockup,
            text,
          )}
        >
          Bread
        </span>
        {slogan ? (
          <span className={cn('mt-1.5 text-[12px] font-normal', sub)}>
            {SLOGAN}
          </span>
        ) : null}
      </span>
    </span>
  );
}
