import {
  OZ_GRAMS,
  convertMoney,
  goldFineGrams,
  money,
  type DebtDenomination,
  type RateMap,
} from '@wib/domain';

/** Per-unit reference value for a thing, keyed by thing id. */
export type ThingValueMap = Map<
  string,
  { valueMinor: number; valueCurrency: string }
>;

/**
 * Convert an outstanding debt amount (in the denomination's own units) into
 * `displayCurrency` minor units, or `null` when it can't be converted:
 * a missing FX rate, an un-priced gold type, or a thing with no known value.
 *
 * Gold: fine-gram weight → USD at the live spot (`usdPerOz`) → display currency.
 * Thing: quantity × the thing's per-unit reference value → display currency.
 * `rates` is the EUR-based map from `getRates()`.
 */
export function debtEquivalentMinor(
  denom: DebtDenomination,
  minor: number,
  rates: RateMap,
  usdPerOz: number | null,
  displayCurrency: string,
  things: ThingValueMap,
): number | null {
  const target = displayCurrency.toUpperCase();

  if (denom.kind === 'money') {
    const conv = convertMoney(money(Math.round(minor), denom.currency), target, rates);
    return conv.currency === target ? conv.minorUnits : null;
  }

  if (denom.kind === 'thing') {
    const t = things.get(denom.thingId);
    if (!t || t.valueMinor <= 0) return null;
    const perUnit = convertMoney(
      money(t.valueMinor, t.valueCurrency),
      target,
      rates,
    );
    if (perUnit.currency !== target) return null;
    // `minor` is thousandths of a unit.
    return Math.round((perUnit.minorUnits * minor) / 1000);
  }

  const grams = goldFineGrams(denom.goldType, minor / 1000);
  if (grams == null || usdPerOz == null) return null;
  const usdMinor = Math.round((grams * usdPerOz) / OZ_GRAMS * 100);
  const conv = convertMoney(money(usdMinor, 'USD'), target, rates);
  return conv.currency === target ? conv.minorUnits : null;
}
