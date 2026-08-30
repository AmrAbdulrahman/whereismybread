import * as ProgressPrimitive from '@radix-ui/react-progress';
import { forwardRef } from 'react';
import { cn } from '../lib/cn';

export interface ProgressProps extends React.ComponentPropsWithoutRef<
  typeof ProgressPrimitive.Root
> {
  /** 0–100 */
  value?: number;
}

export const Progress = forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value = 0, ...props }, ref) => (
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
      className="h-full rounded-full bg-accent transition-[width]"
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = 'Progress';
