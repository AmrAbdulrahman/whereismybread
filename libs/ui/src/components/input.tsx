import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'h-10 w-full rounded-md border border-line-strong bg-ground px-3 text-sm text-ink',
      'placeholder:text-muted',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Label = forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn('text-xs font-medium text-muted', className)}
    {...props}
  />
));
Label.displayName = 'Label';

export const Field = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1.5', className)} {...props} />
);
