import { convertMoney, type Money, type RateMap } from '@wib/domain';

export type RiskLevel = 'none' | 'ok' | 'tight' | 'over';

export interface Risk {
  level: RiskLevel;
  label: string;
  /** Tailwind text-colour class. */
  text: string;
  /** Tailwind background class for a progress bar / dot. */
  bar: string;
}

/** Rate a month's spend against its income. */
export function riskFor(spentMinor: number, incomeMinor: number): Risk {
  if (incomeMinor <= 0)
    return { level: 'none', label: '', text: 'text-muted', bar: 'bg-accent' };
  const ratio = spentMinor / incomeMinor;
  if (ratio > 1)
    return {
      level: 'over',
      label: 'Over budget',
      text: 'text-danger',
      bar: 'bg-danger',
    };
  if (ratio > 0.85)
    return {
      level: 'tight',
      label: 'Running tight',
      text: 'text-warn',
      bar: 'bg-warn',
    };
  return { level: 'ok', label: 'On track', text: 'text-good', bar: 'bg-good' };
}

/** Sum amounts that can be shown in `displayCurrency`, skipping the rest. */
export function sumInDisplay(
  amounts: readonly Money[],
  displayCurrency: string,
  rates: RateMap,
): number {
  let total = 0;
  for (const a of amounts) {
    const c = convertMoney(a, displayCurrency, rates);
    if (c.currency === displayCurrency.toUpperCase()) total += c.minorUnits;
  }
  return total;
}
