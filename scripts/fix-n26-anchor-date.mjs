#!/usr/bin/env node
/**
 * One-off repair for recurring payments (e.g. the "N26" monthly payment)
 * that got anchored a month later than intended.
 *
 * Root cause (fixed in code alongside this script): a brand-new recurring
 * payment's start month was always picked by comparing its day-of-month to
 * *today's* day — if the chosen day had already gone by this month, the
 * series silently rolled to next month, with no way to say "no, start this
 * month". A payment created from a synced bank transaction had the same bug:
 * it used today's date instead of the transaction's own date.
 *
 * This script re-anchors an already-created series into an earlier month,
 * keeping its day-of-month (clamped to that month's length). It never
 * touches `day_of_month` itself, only `anchor_date`.
 *
 * Defaults to a dry run: nothing is written unless --apply is given.
 *
 * Usage (Node 20.6+ for --env-file):
 *
 *   # preview re-anchoring amr's N26 payment to September 2026
 *   node --env-file=.env.local scripts/fix-n26-anchor-date.mjs \
 *     --user amr.abdurahman@gmail.com --month 2026-09
 *
 *   # actually write it
 *   node --env-file=.env.local scripts/fix-n26-anchor-date.mjs \
 *     --user amr.abdurahman@gmail.com --month 2026-09 --apply
 *
 * Flags:
 *   --user <email>    Only payments owned by this user (required).
 *   --name <text>     Match payment name, case-insensitive substring
 *                      (default: "n26").
 *   --month <YYYY-MM> Month to re-anchor the series into (required).
 *   --payment <uuid>  Only this one payment, skipping the name match.
 *   --apply           Write the change. Without it, this only previews.
 */
import postgres from 'postgres';

function parseArgs(argv) {
  const flags = { apply: false, name: 'n26' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') flags.apply = true;
    else if (a === '--user') flags.user = argv[++i];
    else if (a === '--name') flags.name = argv[++i];
    else if (a === '--month') flags.month = argv[++i];
    else if (a === '--payment') flags.payment = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node --env-file=.env.local scripts/fix-n26-anchor-date.mjs --user <email> --month <YYYY-MM> [--name <text>] [--payment <uuid>] [--apply]',
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

if (!flags.user) {
  console.error('--user <email> is required.');
  process.exit(1);
}
if (!flags.month || !/^\d{4}-\d{2}$/.test(flags.month)) {
  console.error('--month <YYYY-MM> is required.');
  process.exit(1);
}

const connStr = process.env.POSTGRES_URL_NON_POOLING;
if (!connStr) {
  console.error(
    'POSTGRES_URL_NON_POOLING is not set (expected in .env.local). Run with --env-file=.env.local.',
  );
  process.exit(1);
}
const sql = postgres(connStr, { prepare: false, max: 1 });

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

async function main() {
  const payments = await sql`
    SELECT p.id, p.name, p.recurrence, p.anchor_date, p.day_of_month
    FROM payments p
    JOIN users u ON u.id = p.user_id
    WHERE lower(u.email) = lower(${flags.user})
      AND p.archived_at IS NULL
      AND p.recurrence != 'one_time'
      ${flags.payment ? sql`AND p.id = ${flags.payment}` : sql`AND p.name ILIKE ${'%' + flags.name + '%'}`}
    ORDER BY p.name
  `;

  if (payments.length === 0) {
    console.log('No matching recurring payment found.');
    await sql.end();
    return;
  }

  const targetDays = daysInMonth(flags.month);
  let changed = 0;

  for (const p of payments) {
    const day = p.day_of_month ?? Number(String(p.anchor_date).slice(8, 10));
    const clampedDay = Math.min(day, targetDays);
    const newAnchor = `${flags.month}-${String(clampedDay).padStart(2, '0')}`;
    const oldAnchor =
      p.anchor_date instanceof Date
        ? p.anchor_date.toISOString().slice(0, 10)
        : String(p.anchor_date);

    if (oldAnchor === newAnchor) {
      console.log(`= ${p.name} (${p.id}): already anchored at ${newAnchor}`);
      continue;
    }

    console.log(
      `${flags.apply ? '✓' : '·'} ${p.name} (${p.id}): ${oldAnchor} -> ${newAnchor}`,
    );
    changed++;

    if (flags.apply) {
      await sql`
        UPDATE payments
        SET anchor_date = ${newAnchor}
        WHERE id = ${p.id}
      `;
    }
  }

  console.log(
    flags.apply
      ? `Updated ${changed} payment(s).`
      : `Dry run — ${changed} payment(s) would change. Re-run with --apply to write.`,
  );

  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
