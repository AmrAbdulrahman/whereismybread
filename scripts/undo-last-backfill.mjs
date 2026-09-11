#!/usr/bin/env node
/**
 * Undo the most recent run of `scripts/backfill-original-value.mjs` — clears
 * `original_value_minor` / `original_value_currency` on exactly the debts
 * that run touched, without disturbing any value someone typed in by hand
 * through the app.
 *
 * There's no "who/what set this" column, so the batch is found by shape: a
 * bulk script run writes many rows back-to-back, each update a fraction of a
 * second after the last (confirmed against this app's own data: a real run
 * over 183 debts had every internal gap under 1 second). A person editing
 * the field in the UI does not produce that pattern — the next-closest gap
 * to any such run has always been minutes, not seconds.
 *
 * This loads every debt with a non-null `original_value_minor`, ordered by
 * `updated_at` descending, and — starting from the most recent — keeps
 * folding rows into "the last batch" as long as each one lands within
 * --gap seconds of the next; it stops at the first bigger gap. Always
 * prints what it found first; nothing is written without --apply.
 *
 * Usage:
 *   node --env-file=.env.local scripts/undo-last-backfill.mjs
 *   node --env-file=.env.local scripts/undo-last-backfill.mjs --apply
 *   node --env-file=.env.local scripts/undo-last-backfill.mjs --gap 30 --min-count 3
 *   node --env-file=.env.local scripts/undo-last-backfill.mjs --user amr@example.com
 *
 * Flags:
 *   --apply           Write (clear) the detected batch. Default: dry run.
 *   --gap <seconds>   Max gap between consecutive writes to still count as
 *                     the same batch (default 10 — see note above; this app's
 *                     real backfill run never had an internal gap over ~1s,
 *                     while the nearest unrelated write was ~2.5 minutes
 *                     away, so 10s has wide safety margin either direction).
 *   --min-count <n>   Refuse to act unless the detected batch has at least
 *                     this many debts (default 5) — a guard against treating
 *                     one coincidental edit as "the batch".
 *   --user <email>    Only list/clear debts *within* the detected batch that
 *                     belong to this user (the batch itself is still found
 *                     across every user, so the shape check stays meaningful).
 */
import postgres from 'postgres';

function parseArgs(argv) {
  const flags = { apply: false, gap: 10, minCount: 5 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') flags.apply = true;
    else if (a === '--gap') flags.gap = Number(argv[++i]);
    else if (a === '--min-count') flags.minCount = Number(argv[++i]);
    else if (a === '--user') flags.user = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node --env-file=.env.local scripts/undo-last-backfill.mjs [--apply] [--gap <seconds>] [--min-count <n>] [--user <email>]',
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

function fmtMoney(minor, ccy) {
  return `${(minor / 100).toFixed(2)} ${ccy}`;
}

async function main() {
  const rows = await sql`
    SELECT d.id, d.updated_at, d.incurred_on, d.description,
           d.original_value_minor, d.original_value_currency, u.email
    FROM debts d
    JOIN users u ON u.id = d.user_id
    WHERE d.original_value_minor IS NOT NULL
    ORDER BY d.updated_at DESC
  `;

  if (rows.length === 0) {
    console.log('No debts have an original value set — nothing to undo.');
    return;
  }

  const gapMs = flags.gap * 1000;
  const batch = [rows[0]];
  for (let i = 1; i < rows.length; i++) {
    const gap = batch[batch.length - 1].updated_at - rows[i].updated_at;
    if (gap > gapMs) break;
    batch.push(rows[i]);
  }

  const newest = batch[0].updated_at.toISOString();
  const oldest = batch[batch.length - 1].updated_at.toISOString();
  console.log(`Most recent write overall: ${rows[0].updated_at.toISOString()}`);
  console.log(
    `Detected batch: ${batch.length} debt(s) each within ${flags.gap}s of the next, spanning ${oldest} → ${newest}.`,
  );
  if (rows.length > batch.length) {
    const nextGapSec = (
      (batch[batch.length - 1].updated_at - rows[batch.length].updated_at) /
      1000
    ).toFixed(1);
    console.log(
      `Next-oldest write outside the batch is ${nextGapSec}s further back — left untouched (${rows.length - batch.length} debt(s) total outside the batch).`,
    );
  }

  if (batch.length < flags.minCount) {
    console.log(
      `\nOnly ${batch.length} debt(s) in this batch (< --min-count ${flags.minCount}) — this doesn't look like a bulk backfill run. Refusing to act. Pass --min-count to override if you're sure this is right.`,
    );
    return;
  }

  const target = flags.user
    ? batch.filter((r) => r.email.toLowerCase() === flags.user.toLowerCase())
    : batch;

  if (target.length === 0) {
    console.log(`\nNo debts in the batch belong to ${flags.user}.`);
    return;
  }

  console.log(
    `\n${flags.apply ? 'Clearing' : 'Would clear'} ${target.length} debt(s):`,
  );
  for (const r of target) {
    console.log(
      `  ${r.email} · ${String(r.incurred_on).slice(0, 10)} · ${r.description || 'No description'} — was ${fmtMoney(r.original_value_minor, r.original_value_currency)}`,
    );
  }

  if (!flags.apply) {
    console.log('\nDry run — re-run with --apply to clear these.');
    return;
  }

  const ids = target.map((r) => r.id);
  // Leave `updated_at` as the backfill left it rather than bumping it again —
  // there's nowhere to recover the true pre-backfill value from anyway.
  await sql`
    UPDATE debts
    SET original_value_minor = NULL, original_value_currency = NULL
    WHERE id IN ${sql(ids)}
  `;
  console.log(`\nCleared ${ids.length} debt(s).`);
}

try {
  await main();
} finally {
  await sql.end();
}
