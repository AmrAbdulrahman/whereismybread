/**
 * Debt tracking — pure helpers shared by the DB layer, the owner UI and the
 * external (OTP-verified) shared page. A debt has a fixed `principalMinor` in
 * one `currency`; repayments ("entries") are recorded in that same currency and
 * chip away at it. All amounts here are integer minor units.
 */

/** `they_owe` — someone owes the user. `i_owe` — the user owes someone. */
export type DebtDirection = 'they_owe' | 'i_owe';

export interface DebtProgress {
  /** Sum of every repayment, clamped to `[0, principal]`. */
  paidMinor: number;
  /** `principal - paid`, never below zero. */
  remainingMinor: number;
  /** `paid / principal` in `[0, 1]` (0 when the principal is 0). */
  progress: number;
  /** Nothing left to repay. */
  settled: boolean;
}

export function debtProgress(input: {
  principalMinor: number;
  paidMinor: number;
}): DebtProgress {
  const principal = Math.max(0, Math.round(input.principalMinor));
  const paid = Math.min(principal, Math.max(0, Math.round(input.paidMinor)));
  const remaining = principal - paid;
  return {
    paidMinor: paid,
    remainingMinor: remaining,
    progress: principal === 0 ? (remaining === 0 ? 1 : 0) : paid / principal,
    settled: remaining <= 0,
  };
}

/** A short natural-language headline for a debt, from the user's point of view. */
export function debtHeadline(
  direction: DebtDirection,
  personName: string,
): string {
  return direction === 'they_owe'
    ? `${personName} owes you`
    : `You owe ${personName}`;
}

/** The same headline written for the other party (used on the shared page). */
export function debtHeadlineForOther(
  direction: DebtDirection,
  ownerName: string,
): string {
  return direction === 'they_owe'
    ? `You owe ${ownerName}`
    : `${ownerName} owes you`;
}

export interface DebtLike {
  direction: DebtDirection;
  currency: string;
  principalMinor: number;
  paidMinor: number;
  settledAt?: string | Date | null;
}

export interface DebtCurrencyTotals {
  currency: string;
  /** Outstanding amount others owe the user. */
  theyOweMinor: number;
  /** Outstanding amount the user owes others. */
  iOweMinor: number;
  /** `theyOwe - iOwe`. */
  netMinor: number;
  /** Debts counted into this bucket. */
  count: number;
}

/**
 * Roll a list of debts up into per-currency outstanding totals. Only the
 * unsettled remainder counts. Debts are grouped by currency because v1 does
 * no FX conversion.
 */
export function summariseDebts(debts: readonly DebtLike[]): DebtCurrencyTotals[] {
  const byCurrency = new Map<string, DebtCurrencyTotals>();
  for (const d of debts) {
    const { remainingMinor } = debtProgress(d);
    if (remainingMinor <= 0) continue;
    const key = d.currency.toUpperCase();
    const bucket = byCurrency.get(key) ?? {
      currency: key,
      theyOweMinor: 0,
      iOweMinor: 0,
      netMinor: 0,
      count: 0,
    };
    if (d.direction === 'they_owe') bucket.theyOweMinor += remainingMinor;
    else bucket.iOweMinor += remainingMinor;
    bucket.netMinor = bucket.theyOweMinor - bucket.iOweMinor;
    bucket.count += 1;
    byCurrency.set(key, bucket);
  }
  return [...byCurrency.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );
}

/** A 6-digit numeric one-time code, as a zero-padded string. */
export function isOtpCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}
