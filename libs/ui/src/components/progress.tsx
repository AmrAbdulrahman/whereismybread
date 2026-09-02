import * as ProgressPrimitive from '@radix-ui/react-progress';
import { forwardRef } from 'react';
import { cn } from '../lib/cn';

export interface ProgressProps extends React.ComponentPropsWithoutRef<
  typeof ProgressPrimitive.Root
> {
  /** 0–100 */
  value?: number;
  /** Extra classes for the filled bar (e.g. a semantic colour). */
  indicatorClassName?: string;
}

export const Progress = forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, indicatorClassName, value = 0, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      'relative h-2 w-full overflow-hidden rounded-full bg-surface-3',
      className,
    )}
    value={value}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn(
        'h-full rounded-full bg-accent transition-[width]',
        indicatorClassName,
      )}
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = 'Progress';
