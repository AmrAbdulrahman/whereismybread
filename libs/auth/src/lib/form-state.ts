/** What an auth server action returns to the form. */
export interface FormState {
  ok: boolean;
  /** A form-level error message. */
  error?: string;
  /** Per-field validation messages, mapped onto the form via setError. */
  fieldErrors?: Record<string, string[]>;
  /** A success message (e.g. "Check your email"). */
  message?: string;
}
