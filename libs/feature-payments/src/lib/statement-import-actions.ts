'use server';

import { requireUserId } from '@wib/auth/server';
import {
  createStatementImport,
  finalizeStatementImport,
  insertImportedTransactions,
} from '@wib/db';
import { revalidatePath } from 'next/cache';
import {
  dedupKey,
  parseStatement,
  StatementParseError,
} from './statement-parser';

const MAX_BYTES = 5 * 1024 * 1024;

export interface ImportStatementResult {
  ok: boolean;
  error?: string;
  imported?: number;
  skipped?: number;
  parsed?: number;
  format?: string;
  source?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
}

/**
 * Parse an uploaded statement CSV and pull in only the transactions not
 * already imported for this user. Dedup is enforced by the
 * `(userId, dedupKey)` unique index, so re-uploading an overlapping
 * statement is safe and idempotent.
 */
export async function importStatementAction(
  formData: FormData,
): Promise<ImportStatementResult> {
  const userId = await requireUserId();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No file received.' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: 'That file is too large (max 5 MB).' };
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith('.csv') && file.type && !file.type.includes('csv')) {
    return { ok: false, error: 'Upload a .csv statement export.' };
  }

  const defaultCurrency =
    (formData.get('defaultCurrency') as string | null)?.toUpperCase() || 'GBP';

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "Couldn't read that file." };
  }

  let statement;
  try {
    statement = parseStatement(text, { defaultCurrency });
  } catch (err) {
    if (err instanceof StatementParseError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: 'That file could not be parsed as a statement.' };
  }

  const importRow = await createStatementImport(userId, {
    filename: file.name.slice(0, 255),
    source: statement.source,
    format: statement.format,
  });

  const rows = statement.rows.map((r) => ({
    dedupKey: dedupKey(r, statement.source),
    source: statement.source,
    externalId: r.externalId,
    occurredAt: r.occurredAt,
    occurredHasTime: r.hasTime,
    description: r.description.slice(0, 500),
    amountMinor: r.amountMinor,
    currency: r.currency.slice(0, 8),
    rawType: r.rawType,
    runningBalanceMinor: r.runningBalanceMinor,
    rawPayload: r.raw as Record<string, unknown>,
  }));

  const imported = await insertImportedTransactions(userId, importRow.id, rows);

  const latest = statement.rows.reduce((a, b) =>
    b.occurredAt > a.occurredAt ? b : a,
  );
  const lastWithId = [...statement.rows].reverse().find((r) => r.externalId);

  await finalizeStatementImport(importRow.id, {
    rowsParsed: statement.rows.length,
    rowsImported: imported,
    rowsSkipped: statement.rows.length - imported,
    periodStart: statement.periodStart,
    periodEnd: statement.periodEnd,
    latestOccurredAt: latest?.occurredAt ?? null,
    latestExternalId: lastWithId?.externalId ?? null,
  });

  revalidatePath('/transactions');
  return {
    ok: true,
    imported,
    skipped: statement.rows.length - imported,
    parsed: statement.rows.length,
    format: statement.format,
    source: statement.source,
    periodStart: statement.periodStart?.toISOString() ?? null,
    periodEnd: statement.periodEnd?.toISOString() ?? null,
  };
}
