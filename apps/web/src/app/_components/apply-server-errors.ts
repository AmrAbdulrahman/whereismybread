'use client';

import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { FormState } from '@wib/auth';

/**
 * Map a server action's `FormState` onto a react-hook-form instance:
 * field errors go through `setError`, the form-level message is returned.
 */
export function applyServerErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  result: FormState,
): string | undefined {
  if (result.fieldErrors) {
    for (const [field, messages] of Object.entries(result.fieldErrors)) {
      if (messages[0]) {
        setError(field as Path<T>, { type: 'server', message: messages[0] });
      }
    }
  }
  return result.error;
}
