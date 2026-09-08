#!/usr/bin/env node
/**
 * Manage the QStash cron schedule that drives the periodic bank sync.
 *
 * The schedule POSTs `<APP_URL>/api/bank-sync/enable-banking` every 5 minutes.
 * QStash signs each request; the endpoint verifies the `Upstash-Signature`
 * against QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY. Retries use the
 * account default policy.
 *
 * A fixed `scheduleId` ("bank-sync") makes `create` idempotent — re-running it
 * updates the existing schedule in place instead of adding a duplicate.
 *
 * Usage (Node 20.6+ for --env-file):
 *
 *   # create / update the schedule against production
 *   APP_URL=https://www.whereismybread.com \
 *     node --env-file=.env.local scripts/qstash-schedule.mjs create
 *
 *   node --env-file=.env.local scripts/qstash-schedule.mjs list
 *   node --env-file=.env.local scripts/qstash-schedule.mjs delete
 *
 * Env: QSTASH_TOKEN, QSTASH_URL (both already in .env.local), APP_URL.
 */
import { Client } from '@upstash/qstash';

const SCHEDULE_ID = 'bank-sync';
const CRON = '*/5 * * * *';
const PATH = '/api/bank-sync/enable-banking';

const token = process.env.QSTASH_TOKEN;
if (!token) {
  console.error('QSTASH_TOKEN is not set (expected in .env.local).');
  process.exit(1);
}

const client = new Client({ token, baseUrl: process.env.QSTASH_URL });
const cmd = process.argv[2] ?? 'list';

async function create() {
  const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
  if (!appUrl || appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
    console.error(
      `Refusing to schedule against "${appUrl || '(unset)'}". ` +
        'Set APP_URL to the public production origin, e.g.\n' +
        '  APP_URL=https://www.whereismybread.com node --env-file=.env.local scripts/qstash-schedule.mjs create',
    );
    process.exit(1);
  }
  const destination = `${appUrl}${PATH}`;
  const { scheduleId } = await client.schedules.create({
    scheduleId: SCHEDULE_ID,
    destination,
    cron: CRON,
    method: 'POST',
    // retries omitted → account default policy
  });
  console.log(`Scheduled ${scheduleId}: POST ${destination} on "${CRON}"`);
}

async function list() {
  const schedules = await client.schedules.list();
  if (schedules.length === 0) {
    console.log('No schedules.');
    return;
  }
  for (const s of schedules) {
    console.log(
      `${s.scheduleId}  ${s.cron}  →  ${s.method} ${s.destination}  ` +
        `retries=${s.retries}${s.isPaused ? '  [paused]' : ''}`,
    );
    if (s.lastScheduleStates) {
      console.log(`  last: ${JSON.stringify(s.lastScheduleStates)}`);
    }
  }
}

async function remove() {
  await client.schedules.delete(SCHEDULE_ID);
  console.log(`Deleted schedule ${SCHEDULE_ID}.`);
}

const actions = { create, list, delete: remove };
const action = actions[cmd];
if (!action) {
  console.error(`Unknown command "${cmd}". Use: create | list | delete`);
  process.exit(1);
}
action().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
