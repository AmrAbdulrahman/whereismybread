export type FeeKind = 'none' | 'fixed' | 'percent';

/** The surcharge (minor units) added on top of a `baseMinor` charge. */
export function feeMinor(
  baseMinor: number,
  kind: FeeKind,
  fixedMinor: number,
  percent: number,
): number {
  if (kind === 'fixed') return Math.max(0, Math.round(fixedMinor));
  if (kind === 'percent') {
    return Math.max(0, Math.round((baseMinor * percent) / 100));
  }
  return 0;
}
