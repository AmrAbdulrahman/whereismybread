/**
 * Gold as a debt denomination. A gold debt tracks a quantity of one gold
 * "type" — a carat purity measured in grams, or a coin / fixed-size bar
 * counted as whole pieces (fractions allowed). No conversion between types or
 * to money: each type is its own non-fungible bucket, like a currency.
 *
 * Quantities are stored as integer **thousandths** of the unit (so 2.5 pieces
 * or 12.345 g both fit an integer column) — the same trick minor units use for
 * money, which lets `debtProgress` stay unit-agnostic.
 */

export type GoldUnit = 'g' | 'piece';

export interface GoldType {
  key: string;
  label: string;
  unit: GoldUnit;
  /** Grouping for the picker. */
  group: 'carat' | 'coin' | 'bar';
  /** A local name shown as a hint. */
  hint?: string;
}

export const GOLD_TYPES: readonly GoldType[] = [
  { key: 'k24', label: '24K gold', unit: 'g', group: 'carat' },
  { key: 'k21', label: '21K gold', unit: 'g', group: 'carat' },
  { key: 'k18', label: '18K gold', unit: 'g', group: 'carat' },
  {
    key: 'coin_egp',
    label: 'Egyptian gold pound',
    unit: 'piece',
    group: 'coin',
    hint: 'جنيه ذهب',
  },
  {
    key: 'coin_sovereign',
    label: 'Gold sovereign (King George)',
    unit: 'piece',
    group: 'coin',
  },
  { key: 'coin_islamic', label: 'Islamic gold dinar', unit: 'piece', group: 'coin' },
  { key: 'bar_1g', label: '1 g bar (999)', unit: 'piece', group: 'bar' },
  { key: 'bar_2g', label: '2 g bar (999)', unit: 'piece', group: 'bar' },
  { key: 'bar_5g', label: '5 g bar (999)', unit: 'piece', group: 'bar' },
  { key: 'bar_10g', label: '10 g bar (999)', unit: 'piece', group: 'bar' },
  { key: 'bar_20g', label: '20 g bar (999)', unit: 'piece', group: 'bar' },
  { key: 'bar_oz', label: '1 oz bar (999)', unit: 'piece', group: 'bar' },
] as const;

/** The stored key for a user-defined type. */
export const GOLD_CUSTOM_KEY = 'custom';

export const GOLD_TYPE_BY_KEY: ReadonlyMap<string, GoldType> = new Map(
  GOLD_TYPES.map((t) => [t.key, t]),
);

export function isBuiltinGoldType(key: string): boolean {
  return GOLD_TYPE_BY_KEY.has(key);
}

/** Human label for a stored `(key, customLabel)` pair. */
export function goldTypeLabel(
  key: string,
  customLabel: string | null | undefined,
): string {
  if (key === GOLD_CUSTOM_KEY) return customLabel?.trim() || 'Custom gold';
  return GOLD_TYPE_BY_KEY.get(key)?.label ?? key;
}

/** Resolve the unit: fixed for built-ins, `storedUnit` for custom. */
export function goldUnitFor(
  key: string,
  storedUnit: string | null | undefined,
): GoldUnit {
  if (key === GOLD_CUSTOM_KEY) return storedUnit === 'piece' ? 'piece' : 'g';
  return GOLD_TYPE_BY_KEY.get(key)?.unit ?? 'g';
}

/** Parse a typed quantity ("2.5", "1,000") to integer thousandths. Throws on ≤ 0. */
export function parseGoldQuantity(input: string): number {
  const n = Number(String(input).replace(/[, ]/g, ''));
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`"${input}" is not a valid quantity`);
  }
  return Math.round(n * 1000);
}

/** Thousandths → a trimmed decimal string ("2.5", "12.345", "10"). */
export function goldQuantityString(thousandths: number): string {
  const q = Math.max(0, Math.round(thousandths)) / 1000;
  if (Number.isInteger(q)) return String(q);
  return q.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * "2.5 × Gold sovereign" (pieces) / "12.345 g of 21K gold" (grams).
 */
export function formatGold(
  thousandths: number,
  key: string,
  customLabel: string | null | undefined,
  unit: GoldUnit,
): string {
  const q = goldQuantityString(thousandths);
  const label = goldTypeLabel(key, customLabel);
  return unit === 'piece' ? `${q} × ${label}` : `${q} g of ${label}`;
}
