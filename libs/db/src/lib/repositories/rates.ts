import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { exchangeRateSnapshots } from '../schema/rates';

const STALE_MS = 12 * 60 * 60 * 1000;
/** How long a resolved rate map is reused within one process without re-reading
 * the snapshot table. The snapshot itself only changes every 12h. */
const MEMO_MS = 60 * 1000;
const BASE = 'EUR';

type RateMap = Record<string, number>;

let refreshing: Promise<RateMap | null> | null = null;
let memo: { rates: RateMap; at: number } | null = null;

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
  // Board renders ask for rates constantly; the snapshot barely moves. Serve a
  // recent in-process copy without touching the DB.
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.rates;

  const rows = await getDb()
    .select()
    .from(exchangeRateSnapshots)
    .where(eq(exchangeRateSnapshots.base, BASE))
    .limit(1);
  const snap = rows[0];

  if (snap) {
    if (Date.now() - snap.fetchedAt.getTime() >= STALE_MS)
      refreshInBackground();
    memo = { rates: snap.rates, at: Date.now() };
    return snap.rates;
  }

  // Cold cache — fetch once so conversions work at all.
  const fresh = (await refreshRates()) ?? { [BASE]: 1 };
  memo = { rates: fresh, at: Date.now() };
  return fresh;
}

// --- gold spot -----------------------------------------------------------
//
// Cached the same way as FX: one row in `exchange_rate_snapshots` keyed
// `base = 'XAU'`, `rates = { USD: <price per troy ounce> }`. No migration.

const GOLD_BASE = 'XAU';
let goldRefreshing: Promise<number | null> | null = null;
let goldMemo: { usdPerOz: number; at: number } | null = null;

async function refreshGoldSpot(): Promise<number | null> {
  try {
    const res = await fetch('https://api.gold-api.com/price/XAU', {
      signal: AbortSignal.timeout(2500),
    });
    const json = (await res.json()) as { price?: number };
    const price = json.price;
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      return null;
    }
    await getDb()
      .insert(exchangeRateSnapshots)
      .values({ base: GOLD_BASE, rates: { USD: price }, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: exchangeRateSnapshots.base,
        set: { rates: { USD: price }, fetchedAt: new Date() },
      });
    return price;
  } catch {
    return null;
  }
}

function refreshGoldInBackground(): void {
  if (goldRefreshing) return;
  goldRefreshing = refreshGoldSpot().finally(() => {
    goldRefreshing = null;
  });
  void goldRefreshing.catch(() => undefined);
}

/**
 * Gold spot in USD per troy ounce, or `null` when it has never been fetched and
 * the provider is unreachable. Serves the cached snapshot immediately, refreshes
 * in the background when stale. Never throws.
 */
export async function getGoldSpotUsdPerOz(): Promise<number | null> {
  if (goldMemo && Date.now() - goldMemo.at < MEMO_MS) return goldMemo.usdPerOz;

  const rows = await getDb()
    .select()
    .from(exchangeRateSnapshots)
    .where(eq(exchangeRateSnapshots.base, GOLD_BASE))
    .limit(1);
  const snap = rows[0];

  if (snap) {
    const price = snap.rates['USD'];
    if (typeof price === 'number' && price > 0) {
      if (Date.now() - snap.fetchedAt.getTime() >= STALE_MS) {
        refreshGoldInBackground();
      }
      goldMemo = { usdPerOz: price, at: Date.now() };
      return price;
    }
  }

  const fresh = await refreshGoldSpot();
  if (fresh != null) goldMemo = { usdPerOz: fresh, at: Date.now() };
  return fresh;
}
