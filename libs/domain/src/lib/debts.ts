/**
 * Debt tracking — pure helpers shared by the DB layer, the owner UI and the
 * external (OTP-verified) shared page.
 *
 * A debt is a basket: one date + one description + several **rows**, each row a
 * quantity in one *denomination* (a fiat currency, or a gold type — see
 * `./gold`). Repayments ("entries") are free-form: each carries its own
 * denomination and is not tied to a row. The debt's state is a **running
 * balance per denomination**: `sum(rows of that denom) − sum(repayments of that
 * denom)`. Amounts are always integers: minor currency units for money,
 * thousandths of a gram / piece for gold.
 */

import { formatGold, goldQuantityString, type GoldUnit } from './gold';
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
    }
  | {
      /** A user-defined "thing" from their debt-things catalogue. */
      kind: 'thing';
      thingId: string;
      thingName: string;
      unit: GoldUnit;
    };

/** A stable key for grouping debts that share a denomination (no FX). */
export function denomKey(d: DebtDenomination): string {
  if (d.kind === 'money') return `money:${d.currency.toUpperCase()}`;
  if (d.kind === 'thing') return `thing:${d.thingId}`;
  return `gold:${d.goldType}:${d.goldType === 'custom' ? (d.goldLabel ?? '').trim().toLowerCase() : ''}`;
}

/** "2.5 × Rolex" (pieces) / "3.5 g of Scrap" (grams). */
export function formatThing(
  thousandths: number,
  name: string,
  unit: GoldUnit,
): string {
  const q = goldQuantityString(thousandths);
  return unit === 'piece' ? `${q} × ${name}` : `${q} g of ${name}`;
}

/** The one place a debt amount is turned into display text. */
export function formatDebtAmount(minor: number, d: DebtDenomination): string {
  if (d.kind === 'money') return formatMoney(money(Math.round(minor), d.currency));
  if (d.kind === 'thing') return formatThing(minor, d.thingName, d.unit);
  return formatGold(minor, d.goldType, d.goldLabel, d.unit);
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

/** One principal row of a debt basket, or one free-form repayment. */
export interface DenomAmount {
  denom: DebtDenomination;
  amountMinor: number;
}

export interface DenomBalance {
  denom: DebtDenomination;
  /** Sum of the principal rows in this denomination. */
  owedMinor: number;
  /** Sum of the repayments in this denomination. */
  repaidMinor: number;
  /** `owed − repaid`, never below zero. */
  outstandingMinor: number;
  /** `min(repaid, owed) / owed` in `[0, 1]`. */
  progress: number;
  /** Nothing left owed in this denomination. */
  settled: boolean;
}

/** Sort key: money first (by currency), then gold, then things (by key). */
function denomSortKey(d: DebtDenomination): string {
  if (d.kind === 'money') return `0:${d.currency.toUpperCase()}`;
  if (d.kind === 'gold') return `1:${denomKey(d)}`;
  return `2:${d.thingName.toLowerCase()}:${denomKey(d)}`;
}

/**
 * The running balance per denomination for one debt: its principal rows netted
 * against its repayments. Only denominations that appear in `rows` get a
 * balance (a stray repayment in an un-owed denomination is ignored here).
 */
export function denomBalances(
  rows: readonly DenomAmount[],
  entries: readonly DenomAmount[],
): DenomBalance[] {
  const owed = new Map<string, { denom: DebtDenomination; minor: number }>();
  for (const r of rows) {
    const k = denomKey(r.denom);
    const cur = owed.get(k);
    if (cur) cur.minor += Math.max(0, Math.round(r.amountMinor));
    else owed.set(k, { denom: r.denom, minor: Math.max(0, Math.round(r.amountMinor)) });
  }
  const repaid = new Map<string, number>();
  for (const e of entries) {
    const k = denomKey(e.denom);
    repaid.set(k, (repaid.get(k) ?? 0) + Math.max(0, Math.round(e.amountMinor)));
  }
  return [...owed.entries()]
    .map(([k, { denom, minor: owedMinor }]) => {
      const repaidMinor = repaid.get(k) ?? 0;
      const outstandingMinor = Math.max(0, owedMinor - repaidMinor);
      return {
        denom,
        owedMinor,
        repaidMinor,
        outstandingMinor,
        progress:
          owedMinor > 0 ? Math.min(repaidMinor, owedMinor) / owedMinor : 1,
        settled: outstandingMinor <= 0,
      };
    })
    .sort((a, b) => denomSortKey(a.denom).localeCompare(denomSortKey(b.denom)));
}

/** A debt is done when it's flagged settled, or every denomination balance is clear. */
export function debtIsSettled(
  balances: readonly DenomBalance[],
  settledAt: string | Date | null | undefined,
): boolean {
  if (settledAt != null) return true;
  return balances.length > 0 && balances.every((b) => b.outstandingMinor <= 0);
}

export interface ValueDrift {
  /** `currentMinor - originalMinor`, in the same (already-converted) currency. */
  deltaMinor: number;
  /** `delta / original`, or `null` when `originalMinor` is 0 (can't take a ratio). */
  pct: number | null;
}

/**
 * How a debt's value has drifted: what it was declared worth when lent vs. what
 * it recalculates to today — both already converted to the same currency.
 */
export function valueDrift(originalMinor: number, currentMinor: number): ValueDrift {
  const deltaMinor = currentMinor - originalMinor;
  return { deltaMinor, pct: originalMinor > 0 ? deltaMinor / originalMinor : null };
}

export interface DebtDenominationTotals {
  denom: DebtDenomination;
  /** Outstanding amount others owe the user. */
  theyOweMinor: number;
  /** Outstanding amount the user owes others. */
  iOweMinor: number;
  /** `theyOwe - iOwe`. */
  netMinor: number;
  /** Balance buckets counted here. */
  count: number;
}

/**
 * Roll per-denomination outstanding balances (from every debt) up into
 * per-denomination both-sides totals. Grouped by denomination because there is
 * no FX / gold conversion.
 */
export function summariseDebts(
  balances: readonly {
    direction: DebtDirection;
    denom: DebtDenomination;
    outstandingMinor: number;
  }[],
): DebtDenominationTotals[] {
  const byDenom = new Map<string, DebtDenominationTotals>();
  for (const b of balances) {
    if (b.outstandingMinor <= 0) continue;
    const key = denomKey(b.denom);
    const bucket = byDenom.get(key) ?? {
      denom: b.denom,
      theyOweMinor: 0,
      iOweMinor: 0,
      netMinor: 0,
      count: 0,
    };
    if (b.direction === 'they_owe') bucket.theyOweMinor += b.outstandingMinor;
    else bucket.iOweMinor += b.outstandingMinor;
    bucket.netMinor = bucket.theyOweMinor - bucket.iOweMinor;
    bucket.count += 1;
    byDenom.set(key, bucket);
  }
  return [...byDenom.values()].sort((a, b) =>
    denomSortKey(a.denom).localeCompare(denomSortKey(b.denom)),
  );
}

export interface DebtEquivalentTotals {
  /** Outstanding others owe the user, converted to the display currency. */
  theyOweMinor: number;
  /** Outstanding the user owes others, converted. */
  iOweMinor: number;
  /** `theyOwe - iOwe`. */
  netMinor: number;
  /** How many outstanding debts had a usable conversion. */
  priced: number;
  /** How many were skipped (no FX rate, or a custom gold type). */
  unpriced: number;
}

/**
 * Roll pre-computed per-debt equivalents (already in one display currency) into
 * a both-sides total. `equivalentMinor === null` means the debt couldn't be
 * converted and is only counted in `unpriced`.
 */
export function debtEquivalentTotals(
  rows: readonly { direction: DebtDirection; equivalentMinor: number | null }[],
): DebtEquivalentTotals {
  let theyOweMinor = 0;
  let iOweMinor = 0;
  let priced = 0;
  let unpriced = 0;
  for (const r of rows) {
    if (r.equivalentMinor == null || r.equivalentMinor <= 0) {
      if (r.equivalentMinor == null) unpriced += 1;
      continue;
    }
    priced += 1;
    if (r.direction === 'they_owe') theyOweMinor += r.equivalentMinor;
    else iOweMinor += r.equivalentMinor;
  }
  return {
    theyOweMinor,
    iOweMinor,
    netMinor: theyOweMinor - iOweMinor,
    priced,
    unpriced,
  };
}

/** A 6-digit numeric one-time code, as a zero-padded string. */
export function isOtpCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}
