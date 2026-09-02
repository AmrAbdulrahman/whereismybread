'use client';

import { forwardRef } from 'react';
import { cn } from '../lib/cn';
import { CurrencyField } from './currency-field';

export interface AmountFieldProps {
  /** Major-unit amount as typed. */
  amount: string;
  onAmountChange: (value: string) => void;
  onAmountBlur?: () => void;
  currency: string;
  onCurrencyChange: (code: string) => void;
  id?: string;
  /** Currencies surfaced first in the picker. */
  usedCurrencies?: string[];
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}

/**
 * One split control for any money amount: a numeric field on the left and a
 * currency picker on the right, sharing a single border. Used everywhere the
 * app takes a financial amount.
 */
export const AmountField = forwardRef<HTMLInputElement, AmountFieldProps>(
  (
    {
      amount,
      onAmountChange,
      onAmountBlur,
      currency,
      onCurrencyChange,
      id,
      usedCurrencies = [],
      placeholder = '0.00',
      autoFocus,
      disabled,
      invalid,
      className,
    },
    ref,
  ) => (
    <div
      className={cn(
        'flex items-stretch overflow-hidden rounded-md border bg-ground',
        'focus-within:ring-2 focus-within:ring-accent',
        invalid ? 'border-danger' : 'border-line-strong',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        data-bwignore
        data-form-type="other"
        placeholder={placeholder}
        value={amount}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => onAmountChange(e.target.value)}
        onBlur={onAmountBlur}
        className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-ink placeholder:text-muted focus-visible:outline-none disabled:cursor-not-allowed"
      />
      <span className="my-1.5 w-px shrink-0 bg-line-strong" aria-hidden />
      <CurrencyField
        value={currency}
        onChange={onCurrencyChange}
        usedCodes={usedCurrencies}
        triggerClassName={cn(
          'h-auto shrink-0 gap-1 rounded-none border-0 bg-transparent px-2.5 text-muted',
          disabled && 'pointer-events-none',
        )}
      />
    </div>
  ),
);
AmountField.displayName = 'AmountField';
