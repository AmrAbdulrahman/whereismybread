import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, type = 'text', autoComplete, ...props }, ref) => {
  // A field only opts into password managers by naming a real credential /
  // identity token (`autoComplete="email"`, `"current-password"`, `"name"`…).
  // Everything else — amounts, dates, day-of-month, descriptions — is marked so
  // 1Password / LastPass / Bitwarden / Dashlane leave it alone. Callers can
  // still override any of this by passing the attribute explicitly.
  const managed = autoComplete != null && autoComplete !== 'off';
  return (
    <input
      ref={ref}
      type={type}
      autoComplete={managed ? autoComplete : 'off'}
      data-1p-ignore={managed ? undefined : true}
      data-lpignore={managed ? undefined : 'true'}
      data-bwignore={managed ? undefined : true}
      data-form-type={managed ? undefined : 'other'}
      className={cn(
        'h-10 w-full rounded-md border border-line-strong bg-ground px-3 text-sm text-ink',
        'placeholder:text-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
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
