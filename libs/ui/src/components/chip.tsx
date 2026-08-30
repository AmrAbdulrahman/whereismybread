import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

const chip = cva(
  'inline-flex items-center gap-1.5 rounded-full text-[11px] font-medium leading-none',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-2 text-ink-soft',
        accent: 'bg-accent/15 text-accent',
        teal: 'bg-teal/15 text-teal',
        warn: 'bg-warn/15 text-warn',
        outline: 'border border-line-strong text-muted',
      },
      size: {
        sm: 'px-2 py-0.5',
        md: 'px-2.5 py-1',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'sm' },
  },
);

export interface ChipProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof chip> {}

export function Chip({ className, tone, size, ...props }: ChipProps) {
  return <span className={cn(chip({ tone, size }), className)} {...props} />;
}
