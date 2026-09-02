/**
 * The shared swatch palette for anything the user colour-codes — payment
 * methods, banks, accounts, tags. Grouped roughly by hue, two tones each.
 */
export const COLOR_PALETTE = [
  '#6321d6',
  '#7c3aed',
  '#8b5cf6',
  '#a855f7',
  '#c026d3',
  '#db2777',
  '#e11d48',
  '#dc2626',
  '#ea580c',
  '#d97706',
  '#ca8a04',
  '#65a30d',
  '#16a34a',
  '#059669',
  '#0d9488',
  '#0891b2',
  '#0284c7',
  '#2563eb',
  '#4f46e5',
  '#7e22ce',
  '#9d174d',
  '#b45309',
  '#4d7c0f',
  '#155e75',
  '#1d4ed8',
  '#475569',
  '#57534e',
  '#1e293b',
] as const;

export type PaletteColor = (typeof COLOR_PALETTE)[number];

/** A random palette colour — handy as a default when the user doesn't pick. */
export function randomPaletteColor(): string {
  return (
    COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)] ??
    COLOR_PALETTE[0]
  );
}
