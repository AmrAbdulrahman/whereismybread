/**
 * Money is always stored and passed around as an integer number of minor units
 * (cents) plus an ISO-4217 currency code. Never a float.
 *
 * Phase 0 assumes a 2-decimal currency; per-currency exponents come later.
 */
export interface Money {
  readonly minorUnits: number;
  readonly currency: string;
}

const MINOR_PER_MAJOR = 100;

export function money(minorUnits: number, currency: string): Money {
  if (!Number.isInteger(minorUnits)) {
    throw new TypeError(
      `money() needs an integer minor-unit amount, got ${minorUnits}`,
    );
  }
  return { minorUnits, currency: currency.toUpperCase() };
}

export function zeroMoney(currency: string): Money {
  return money(0, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot combine ${a.currency} with ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minorUnits + b.minorUnits, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minorUnits - b.minorUnits, a.currency);
}

export function sumMoney(amounts: readonly Money[], currency: string): Money {
  return amounts.reduce((acc, m) => addMoney(acc, m), zeroMoney(currency));
}

/** Parse a user-typed amount ("1,450.00", "€12.99", "12") into minor units. */
export function parseMoneyInput(input: string, currency: string): Money {
  const cleaned = input.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) {
    throw new Error(`"${input}" is not a valid amount`);
  }
  return money(Math.round(value * MINOR_PER_MAJOR), currency);
}

export function formatMoney(
  value: Money,
  {
    locale = 'en-IE',
    showDecimals = true,
  }: { locale?: string; showDecimals?: boolean } = {},
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(value.minorUnits / MINOR_PER_MAJOR);
}
