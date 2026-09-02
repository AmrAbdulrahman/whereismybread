import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { exchangeRateSnapshots } from '../schema/rates';

const STALE_MS = 12 * 60 * 60 * 1000;
const BASE = 'EUR';

type RateMap = Record<string, number>;

let refreshing: Promise<RateMap | null> | null = null;

/** Pull fresh rates from the provider and upsert the snapshot. Never throws. */
async function refreshRates(): Promise<RateMap | null> {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${BASE}`, {
      signal: AbortSignal.timeout(2500),
    });
    const json = (await res.json()) as {
      result?: string;
      rates?: RateMap;
    };
    if (json.result !== 'success' || !json.rates) return null;
    const rates = json.rates;
    await getDb()
      .insert(exchangeRateSnapshots)
      .values({ base: BASE, rates, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: exchangeRateSnapshots.base,
        set: { rates, fetchedAt: new Date() },
      });
    return rates;
  } catch {
    return null;
  }
}

/** De-duped background refresh — many concurrent renders share one fetch. */
function refreshInBackground(): void {
  if (refreshing) return;
  refreshing = refreshRates().finally(() => {
    refreshing = null;
  });
  // Swallow rejections; this is best-effort.
  void refreshing.catch(() => undefined);
}

/**
 * Rate map relative to EUR: `{ EUR: 1, GBP: 0.85, EGP: 52.3, ... }`.
 *
 * Serves the cached snapshot immediately and refreshes it in the background
 * when stale — a request never waits on the provider unless there is no
 * snapshot at all. Never throws; falls back to identity.
 */
export async function getRates(): Promise<RateMap> {
  const rows = await getDb()
    .select()
    .from(exchangeRateSnapshots)
    .where(eq(exchangeRateSnapshots.base, BASE))
    .limit(1);
  const snap = rows[0];

  if (snap) {
    if (Date.now() - snap.fetchedAt.getTime() >= STALE_MS)
      refreshInBackground();
    return snap.rates;
  }

  // Cold cache — fetch once so conversions work at all.
  return (await refreshRates()) ?? { [BASE]: 1 };
}
