#!/usr/bin/env node
/**
 * Backfill `debts.original_value_minor` / `original_value_currency` for debts
 * that don't have one yet, valuing every row on the debt as of its own
 * `incurred_on` date rather than today.
 *
 * Never overwrites a value the owner typed in by hand — only debts where
 * `original_value_minor IS NULL` are touched, unless --force is passed.
 * Defaults to a dry run: nothing is written unless --apply is given.
 *
 * Usage (Node 20.6+ for --env-file):
 *
 *   # preview what it would do, against every debt with no original value
 *   node --env-file=.env.local scripts/backfill-original-value.mjs
 *
 *   # same, but only print debts with issues / approximations
 *   node --env-file=.env.local scripts/backfill-original-value.mjs --quiet
 *
 *   # actually write the results
 *   node --env-file=.env.local scripts/backfill-original-value.mjs --apply
 *
 *   # recompute + overwrite debts that already have a value
 *   node --env-file=.env.local scripts/backfill-original-value.mjs --apply --force
 *
 *   # scope to one user / one debt, for testing
 *   node --env-file=.env.local scripts/backfill-original-value.mjs --user amr@example.com
 *   node --env-file=.env.local scripts/backfill-original-value.mjs --debt <uuid> --apply
 *
 * Flags:
 *   --apply            Write results. Without it, this only prints a preview.
 *   --force            Recompute debts that already have an original value.
 *   --user <email>     Only debts owned by this user.
 *   --debt <uuid>      Only this one debt.
 *   --limit <n>        Stop after n debts (for a quick test run).
 *   --quiet            Only print debts that were skipped or approximated,
 *                      plus the final summary.
 *
 * --- Historical pricing sources (all keyless — no API key configured) -----
 *
 * Money rows try two historical sources, in order, before giving up:
 *   1. https://api.frankfurter.dev — ECB reference rates, daily since 1999,
 *      but only ~30 major currencies (no EGP, AED, SAR, …).
 *   2. https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api — a community
 *      mirror with 200+ currencies (EGP included), but its jsdelivr archive
 *      only goes back to ~early March 2024 — older dates 404.
 * A debt whose currency/date isn't covered by either falls back to the app's
 * cached *current* FX snapshot (`exchange_rate_snapshots`, base EUR) —
 * flagged "approx" in the output. In practice: EGP debts from 2024-03
 * onward get real historical pricing; older EGP debts (this app's dataset
 * has some from 2013) don't — there's no free keyless source that far back.
 *
 * Gold rows: no free keyless historical gold-price API was found (gold-api.com,
 * the app's live-spot source, has no history endpoint; every provider that
 * does needs a paid key). Every gold row is priced at *today's* spot instead
 * — always flagged "approx". A debt whose rows are entirely gold will show up
 * fully approximate: its "original value" is really "what that gold is worth
 * today", which makes the drift shown in the app read as ~0% until spot moves.
 *
 * Thing rows: no historical concept at all — priced at the thing's *current*
 * `debt_things.value_minor` — always flagged "approx".
 *
 * A debt with literally nothing priceable on it (e.g. every row is an
 * unvalued thing) is left untouched and reported as skipped.
 */
import postgres from 'postgres';

// --- gold catalogue (mirrors libs/domain/src/lib/gold.ts) -----------------

const OZ_GRAMS = 31.1034768;
const GOLD_FINE_GRAMS = {
  k24: 1,
  k21: 0.875,
  k18: 0.75,
  coin_egp: 7.0,
  coin_sovereign: 7.322,
  coin_islamic: 4.25,
  bar_1g: 0.999,
  bar_2g: 1.998,
  bar_5g: 4.995,
  bar_10g: 9.99,
  bar_20g: 19.98,
  bar_50g: 49.95,
  bar_oz: OZ_GRAMS * 0.999,
};

// --- currency minor-unit exponents (mirrors libs/domain/src/lib/currency.ts) --

const CURRENCY_DECIMALS = {
  JPY: 0,
  CLP: 0,
  KRW: 0,
  VND: 0,
  ISK: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
  JOD: 3,
  TND: 3,
};
const decimalsOf = (ccy) => CURRENCY_DECIMALS[ccy] ?? 2;
const minorFactor = (ccy) => 10 ** decimalsOf(ccy);

// --- CLI ---------------------------------------------------------------

function parseArgs(argv) {
  const flags = { apply: false, force: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') flags.apply = true;
    else if (a === '--force') flags.force = true;
    else if (a === '--quiet') flags.quiet = true;
    else if (a === '--user') flags.user = argv[++i];
    else if (a === '--debt') flags.debt = argv[++i];
    else if (a === '--limit') flags.limit = Number(argv[++i]);
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node --env-file=.env.local scripts/backfill-original-value.mjs [--apply] [--force] [--quiet] [--user <email>] [--debt <uuid>] [--limit <n>]',
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a} (--help for usage)`);
      process.exit(1);
    }
  }
  return flags;
}

const flags = parseArgs(process.argv.slice(2));

const connStr = process.env.POSTGRES_URL_NON_POOLING;
if (!connStr) {
  console.error(
    'POSTGRES_URL_NON_POOLING is not set (expected in .env.local). Run with --env-file=.env.local.',
  );
  process.exit(1);
}
const sql = postgres(connStr, { prepare: false, max: 1 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Frankfurter: historical FX, keyless, ECB reference rates -------------

// One in-flight/resolved fetch per date, shared across every row that needs it.
const frankfurterCache = new Map();
async function frankfurterEurRates(isoDate) {
  if (!frankfurterCache.has(isoDate)) {
    frankfurterCache.set(
      isoDate,
      (async () => {
        try {
          await sleep(120); // be a polite, keyless citizen
          const res = await fetch(
            `https://api.frankfurter.dev/v1/${isoDate}?base=EUR`,
            { signal: AbortSignal.timeout(5000) },
          );
          if (!res.ok) return null;
          const json = await res.json();
          return { EUR: 1, ...json.rates };
        } catch {
          return null;
        }
      })(),
    );
  }
  return frankfurterCache.get(isoDate);
}

// Second historical source: broader currency coverage (200+, incl. EGP), but
// its jsdelivr archive only reaches back to ~early March 2024.
const fawazCache = new Map();
async function fawazEurRates(isoDate) {
  if (!fawazCache.has(isoDate)) {
    fawazCache.set(
      isoDate,
      (async () => {
        try {
          await sleep(120);
          const res = await fetch(
            `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${isoDate}/v1/currencies/eur.json`,
            { signal: AbortSignal.timeout(5000) },
          );
          if (!res.ok) return null;
          const json = await res.json();
          if (!json.eur) return null;
          const rates = { EUR: 1 };
          for (const [code, rate] of Object.entries(json.eur)) {
            rates[code.toUpperCase()] = rate;
          }
          return rates;
        } catch {
          return null;
        }
      })(),
    );
  }
  return fawazCache.get(isoDate);
}

/** Try each historical source in turn; `null` if neither has this date. */
async function historicalEurRates(isoDate) {
  const frankfurter = await frankfurterEurRates(isoDate);
  if (frankfurter) return frankfurter;
  return fawazEurRates(isoDate);
}

// --- the app's own cached "live" snapshots, as a fallback -------------------

async function liveEurRates() {
  const rows =
    await sql`select rates from exchange_rate_snapshots where base = 'EUR' limit 1`;
  return rows[0]?.rates ? { EUR: 1, ...rows[0].rates } : { EUR: 1 };
}

async function liveGoldUsdPerOz() {
  const rows =
    await sql`select rates from exchange_rate_snapshots where base = 'XAU' limit 1`;
  const usd = rows[0]?.rates?.USD;
  return typeof usd === 'number' && usd > 0 ? usd : null;
}

// --- conversion ----------------------------------------------------------

/** Convert `minor` units of `from` into `to`, given an EUR-based rate map. */
function convert(minor, from, to, eurRates) {
  if (from === to) return minor;
  const fromRate = eurRates[from];
  const toRate = eurRates[to];
  if (!fromRate || !toRate) return null;
  const major = (minor / minorFactor(from)) * (toRate / fromRate);
  return Math.round(major * minorFactor(to));
}

/**
 * Price one `debt_lines` row as of `incurredOn`, converted into `target`.
 * Returns `{ minor, approx }`, or `null` when it can't be priced at all.
 */
async function priceRow(row, incurredOn, target, liveEur, liveGoldSpot) {
  if (row.denom_kind === 'money') {
    const src = row.currency;
    const hist = await historicalEurRates(incurredOn);
    if (hist) {
      const v = convert(row.amount_minor, src, target, hist);
      if (v != null) return { minor: v, approx: false };
    }
    const v = convert(row.amount_minor, src, target, liveEur);
    return v == null ? null : { minor: v, approx: true };
  }

  if (row.denom_kind === 'gold') {
    const fineGramsPerUnit = GOLD_FINE_GRAMS[row.gold_type];
    if (fineGramsPerUnit == null || liveGoldSpot == null) return null;
    const grams = fineGramsPerUnit * (row.amount_minor / 1000);
    const usdMinor = Math.round(((grams * liveGoldSpot) / OZ_GRAMS) * 100);
    const v = convert(usdMinor, 'USD', target, liveEur);
    return v == null ? null : { minor: v, approx: true };
  }

  if (row.denom_kind === 'thing') {
    if (row.thing_value_minor == null || row.thing_value_minor <= 0) {
      return null;
    }
    const qty = row.amount_minor / 1000;
    const nativeMinor = Math.round(row.thing_value_minor * qty);
    const v = convert(nativeMinor, row.thing_value_currency, target, liveEur);
    return v == null ? null : { minor: v, approx: true };
  }

  return null;
}

function fmt(minor, ccy) {
  return `${(minor / minorFactor(ccy)).toFixed(decimalsOf(ccy))} ${ccy}`;
}

// --- main ------------------------------------------------------------

async function main() {
  console.log(
    flags.apply
      ? '⚠️  --apply set: this WILL write to the database.'
      : 'Dry run — nothing will be written (pass --apply to persist).',
  );
  if (flags.force) console.log('--force set: recomputing debts that already have a value.');

  const debts = await sql`
    SELECT d.id, d.incurred_on, d.description, d.original_value_minor,
           u.default_currency, u.email
    FROM debts d
    JOIN users u ON u.id = d.user_id
    WHERE (${flags.force} OR d.original_value_minor IS NULL)
    ${flags.debt ? sql`AND d.id = ${flags.debt}` : sql``}
    ${flags.user ? sql`AND lower(u.email) = lower(${flags.user})` : sql``}
    ORDER BY d.incurred_on
    ${flags.limit ? sql`LIMIT ${flags.limit}` : sql``}
  `;

  console.log(`${debts.length} candidate debt(s).\n`);

  const [liveEur, liveGoldSpot] = await Promise.all([
    liveEurRates(),
    liveGoldUsdPerOz(),
  ]);
  if (liveGoldSpot == null) {
    console.log(
      '(no cached gold spot yet — gold rows will be skipped as unpriced)',
    );
  }

  let written = 0;
  let skippedHasValue = 0;
  let skippedUnpriceable = 0;
  let exactCount = 0;
  let approxCount = 0;

  for (const debt of debts) {
    if (debt.original_value_minor != null && !flags.force) {
      skippedHasValue += 1;
      continue;
    }

    const lines = await sql`
      SELECT dl.denom_kind, dl.currency, dl.gold_type, dl.amount_minor,
             t.value_minor AS thing_value_minor,
             t.value_currency AS thing_value_currency
      FROM debt_lines dl
      LEFT JOIN debt_things t ON t.id = dl.thing_id
      WHERE dl.debt_id = ${debt.id}
    `;

    const target = debt.default_currency;
    const incurredOn =
      debt.incurred_on instanceof Date
        ? debt.incurred_on.toISOString().slice(0, 10)
        : String(debt.incurred_on);

    let totalMinor = 0;
    let priced = 0;
    let unpriced = 0;
    let anyApprox = false;

    for (const row of lines) {
      const result = await priceRow(row, incurredOn, target, liveEur, liveGoldSpot);
      if (result == null) {
        unpriced += 1;
        continue;
      }
      totalMinor += result.minor;
      if (result.approx) anyApprox = true;
      priced += 1;
    }

    const label = `${debt.email} · ${incurredOn} · ${debt.description || 'No description'}`;

    if (priced === 0) {
      skippedUnpriceable += 1;
      console.log(`[skip] ${label} — nothing priceable (${unpriced} row(s))`);
      continue;
    }

    if (anyApprox) approxCount += 1;
    else exactCount += 1;

    const tag = anyApprox ? 'approx' : 'exact';
    const rowsNote = unpriced > 0 ? `, ${unpriced} row(s) unpriced` : '';
    if (!flags.quiet || anyApprox || unpriced > 0) {
      console.log(
        `[${flags.apply ? 'write' : 'dry-run'}:${tag}] ${label} → ${fmt(totalMinor, target)} (${priced}/${lines.length} row(s) priced${rowsNote})`,
      );
    }

    if (flags.apply) {
      await sql`
        UPDATE debts
        SET original_value_minor = ${totalMinor},
            original_value_currency = ${target},
            updated_at = now()
        WHERE id = ${debt.id}
      `;
      written += 1;
    } else {
      written += 1; // "would write" count in the summary
    }
  }

  console.log('\n--- summary ---');
  console.log(`Scanned:               ${debts.length}`);
  console.log(
    `${flags.apply ? 'Written' : 'Would write'}:            ${written} (${exactCount} exact, ${approxCount} with an approximation)`,
  );
  console.log(`Skipped (has a value):  ${skippedHasValue}`);
  console.log(`Skipped (unpriceable):  ${skippedUnpriceable}`);
  if (!flags.apply && written > 0) {
    console.log('\nRe-run with --apply to persist these.');
  }
}

try {
  await main();
} finally {
  await sql.end();
}
