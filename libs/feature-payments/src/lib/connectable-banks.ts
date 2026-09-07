/**
 * Banks this app can connect to automatically via Enable Banking. Plain data
 * (no server-only imports) so both server actions and client components can
 * use it.
 *
 * `aspspCountry` is the ASPSP's home country in Enable Banking's catalog —
 * pan-European banks route to the same API regardless, so we pick the
 * banking entity's home:
 *  - Wise → Wise Europe SA/NV (Belgium)
 *  - N26  → N26 Bank AG (Germany)
 */
export interface ConnectableBank {
  /** Stable key. */
  key: string;
  /** Bank name as shown in the app (matched against `banks.name`). */
  label: string;
  /** ASPSP name in Enable Banking's catalog. */
  aspspName: string;
  aspspCountry: string;
  psuType: 'personal' | 'business';
  /** Matches an existing `banks.name` to this catalog entry. */
  match: RegExp;
}

export const CONNECTABLE_BANKS: ConnectableBank[] = [
  {
    key: 'wise',
    label: 'Wise',
    aspspName: 'Wise',
    aspspCountry: 'BE',
    psuType: 'personal',
    match: /\b(wise|transferwise)\b/i,
  },
  {
    key: 'n26',
    label: 'N26',
    aspspName: 'N26',
    aspspCountry: 'DE',
    psuType: 'personal',
    match: /\bn26\b|\bnumber\s?26\b/i,
  },
];

/** The catalog entry whose `match` fits this bank name, if any. */
export function connectableForBankName(
  name: string,
): ConnectableBank | undefined {
  return CONNECTABLE_BANKS.find((b) => b.match.test(name));
}
