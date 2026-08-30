'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { Button, Field, Input, Label } from '@wib/ui';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, id, name, ...props }, ref) => {
    const fieldId = id ?? name;
    return (
      <Field>
        <Label htmlFor={fieldId}>{label}</Label>
        <Input
          ref={ref}
          id={fieldId}
          name={name}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </Field>
    );
  },
);
TextField.displayName = 'TextField';

export function FormAlert({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
    >
      {message}
    </p>
  );
}

export function FormMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className="rounded-md border border-teal/40 bg-teal/10 px-3 py-2 text-sm text-teal"
    >
      {message}
    </p>
  );
}

export function SubmitButton({
  pending,
  children,
}: {
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Working…' : children}
    </Button>
  );
}
