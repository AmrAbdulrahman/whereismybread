import { goldTypeLabel, type DebtDenomination } from '@wib/domain';
import { GoldMark } from './gold-mark';
import { ThingMark } from './thing-mark';

/** A short name for a denomination: the currency code, gold type, or thing name. */
export function denomLabel(denom: DebtDenomination): string {
  if (denom.kind === 'money') return denom.currency;
  if (denom.kind === 'thing') return denom.thingName;
  return goldTypeLabel(denom.goldType, denom.goldLabel);
}

/**
 * The little mark shown before a debt amount: a gold coin/bar, a thing's logo,
 * or nothing for a plain currency. `logos` maps thing id → logo url.
 */
export function DenomMark({
  denom,
  size = 14,
  logos,
}: {
  denom: DebtDenomination;
  size?: number;
  logos?: Map<string, string | null> | Record<string, string | null>;
}) {
  if (denom.kind === 'gold') return <GoldMark type={denom.goldType} size={size} />;
  if (denom.kind === 'thing') {
    const logoUrl =
      logos instanceof Map
        ? (logos.get(denom.thingId) ?? null)
        : (logos?.[denom.thingId] ?? null);
    return (
      <ThingMark thing={{ name: denom.thingName, logoUrl }} size={size} />
    );
  }
  return null;
}
