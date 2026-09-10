/**
 * Debt tracking — pure helpers shared by the DB layer, the owner UI and the
 * external (OTP-verified) shared page. A debt has a fixed principal in one
 * *denomination* — a fiat currency, or a gold type (see `./gold`). Repayments
 * ("entries") are in that same denomination and chip away at it. Amounts are
 * always integers: minor currency units for money, thousandths of a gram /
 * piece for gold — so the progress math below is denomination-agnostic.
 */

import { formatGold, type GoldUnit } from './gold';
import { formatMoney, money } from './money';

/** `they_owe` — someone owes the user. `i_owe` — the user owes someone. */
export type DebtDirection = 'they_owe' | 'i_owe';

/** What a debt's principal + repayments are measured in. */
export type DebtDenomination =
  | { kind: 'money'; currency: string }
  | {
      kind: 'gold';
      goldType: string;
      goldLabel: string | null;
      unit: GoldUnit;
    };

/** A stable key for grouping debts that share a denomination (no FX). */
export function denomKey(d: DebtDenomination): string {
  return d.kind === 'money'
    ? `money:${d.currency.toUpperCase()}`
    : `gold:${d.goldType}:${d.goldType === 'custom' ? (d.goldLabel ?? '').trim().toLowerCase() : ''}`;
}

/** The one place a debt amount is turned into display text. */
export function formatDebtAmount(minor: number, d: DebtDenomination): string {
  return d.kind === 'money'
    ? formatMoney(money(Math.round(minor), d.currency))
    : formatGold(minor, d.goldType, d.goldLabel, d.unit);
}

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
  denom: DebtDenomination;
  principalMinor: number;
  paidMinor: number;
  settledAt?: string | Date | null;
}

export interface DebtDenominationTotals {
  denom: DebtDenomination;
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
 * Roll a list of debts up into per-denomination outstanding totals. Only the
 * unsettled remainder counts. Grouped by denomination because there is no FX /
 * gold conversion.
 */
export function summariseDebts(
  debts: readonly DebtLike[],
): DebtDenominationTotals[] {
  const byDenom = new Map<string, DebtDenominationTotals>();
  for (const d of debts) {
    const { remainingMinor } = debtProgress(d);
    if (remainingMinor <= 0) continue;
    const key = denomKey(d.denom);
    const bucket = byDenom.get(key) ?? {
      denom: d.denom,
      theyOweMinor: 0,
      iOweMinor: 0,
      netMinor: 0,
      count: 0,
    };
    if (d.direction === 'they_owe') bucket.theyOweMinor += remainingMinor;
    else bucket.iOweMinor += remainingMinor;
    bucket.netMinor = bucket.theyOweMinor - bucket.iOweMinor;
    bucket.count += 1;
    byDenom.set(key, bucket);
  }
  return [...byDenom.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}

/** A 6-digit numeric one-time code, as a zero-padded string. */
export function isOtpCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}
