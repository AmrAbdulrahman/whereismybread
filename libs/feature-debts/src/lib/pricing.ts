import {
  OZ_GRAMS,
  convertMoney,
  goldFineGrams,
  money,
  type DebtDenomination,
  type RateMap,
} from '@wib/domain';

/**
 * Convert an outstanding debt amount (in the denomination's own units) into
 * `displayCurrency` minor units, or `null` when it can't be converted:
 * a missing FX rate, or a gold type with no known purity/weight (custom).
 *
 * Gold: fine-gram weight → USD at the live spot (`usdPerOz`) → display currency
 * via the FX map. `rates` is the EUR-based map from `getRates()`.
 */
export function debtEquivalentMinor(
  denom: DebtDenomination,
  minor: number,
  rates: RateMap,
  usdPerOz: number | null,
  displayCurrency: string,
): number | null {
  const target = displayCurrency.toUpperCase();

  if (denom.kind === 'money') {
    const conv = convertMoney(money(Math.round(minor), denom.currency), target, rates);
    return conv.currency === target ? conv.minorUnits : null;
  }

  const grams = goldFineGrams(denom.goldType, minor / 1000);
  if (grams == null || usdPerOz == null) return null;
  const usdMinor = Math.round((grams * usdPerOz) / OZ_GRAMS * 100);
  const conv = convertMoney(money(usdMinor, 'USD'), target, rates);
  return conv.currency === target ? conv.minorUnits : null;
}
