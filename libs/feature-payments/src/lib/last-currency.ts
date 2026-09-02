const KEY = 'wib:last-currency';

/** The currency the user last picked for a new payment, if any. */
export function readLastCurrency(): string | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v && /^[A-Z]{3}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeLastCurrency(code: string): void {
  try {
    window.localStorage.setItem(KEY, code.toUpperCase());
  } catch {
    /* private mode / storage disabled — no-op */
  }
}
