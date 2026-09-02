import { currencyMeta } from './currency';

/**
 * Money is an integer number of the currency's minor units plus its ISO-4217
 * code. Never a float. Minor units follow the currency's own exponent
 * (EGP/EUR = 2, JPY = 0, BHD = 3).
 */
export interface Money {
  readonly minorUnits: number;
  readonly currency: string;
}

/** Units of `X` per 1 unit of the rate base, e.g. { EUR: 1, EGP: 52.3, ... }. */
export type RateMap = Record<string, number>;

function minorFactor(currency: string): number {
  return 10 ** currencyMeta(currency).decimals;
}

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

export function toMajor(value: Money): number {
  return value.minorUnits / minorFactor(value.currency);
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
  const raw = input.replace(/[^0-9.-]/g, '');
  const dot = raw.indexOf('.');
  const cleaned =
    dot === -1
      ? raw
      : raw.slice(0, dot + 1) + raw.slice(dot + 1).replace(/\./g, '');
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) {
    throw new Error(`"${input}" is not a valid amount`);
  }
  return money(Math.round(value * minorFactor(currency)), currency);
}

export function convertMoney(
  value: Money,
  toCurrency: string,
  rates: RateMap,
): Money {
  const to = toCurrency.toUpperCase();
  if (value.currency === to) return value;
  const from = rates[value.currency];
  const target = rates[to];
  if (!from || !target) return value; // no rate — leave as-is
  const major = toMajor(value) * (target / from);
  return money(Math.round(major * minorFactor(to)), to);
}

export function formatMoney(
  value: Money,
  {
    locale = 'en-GB',
    style = 'symbol',
  }: { locale?: string; style?: 'symbol' | 'code' } = {},
): string {
  const { decimals, symbol } = currencyMeta(value.currency);
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toMajor(value));

  if (style === 'code') return `${number} ${value.currency}`;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: value.currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(toMajor(value));
  } catch {
    return `${symbol}${number}`;
  }
}

/**
 * "£100.00 (6,000.00 EGP)" — converted into `displayCurrency`, original in
 * brackets. Falls back to a plain format when currency matches or no rate.
 */
export function formatConverted(
  value: Money,
  displayCurrency: string,
  rates: RateMap,
  opts: { locale?: string } = {},
): string {
  const display = displayCurrency.toUpperCase();
  if (value.currency === display || !rates[value.currency] || !rates[display]) {
    return formatMoney(value, opts);
  }
  const converted = convertMoney(value, display, rates);
  return `${formatMoney(converted, opts)} (${formatMoney(value, { ...opts, style: 'code' })})`;
}
