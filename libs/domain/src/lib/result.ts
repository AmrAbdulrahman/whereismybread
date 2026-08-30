/**
 * Discriminated result for server actions and repository calls, so callers
 * branch on `ok` instead of catching. Validation errors carry a field map the
 * forms can render inline.
 */
export type Result<T, E = string> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error: E;
      readonly fieldErrors?: Record<string, string[]>;
    };

export function ok<T>(data: T): Result<T, never> {
  return { ok: true, data };
}

export function err<E = string>(
  error: E,
  fieldErrors?: Record<string, string[]>,
): Result<never, E> {
  return { ok: false, error, fieldErrors };
}
