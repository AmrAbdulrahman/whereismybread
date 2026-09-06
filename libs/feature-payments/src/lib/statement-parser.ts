/**
 * Best-effort parser for bank statement CSVs. Tuned for the common UK
 * formats (Wise, Monzo, Revolut, Starling) with a generic header-matching
 * fallback for everything else. Pure — no IO — so it's cheap to unit-test.
 */

export interface ParsedRow {
  /** The bank's own transaction id, when the format carries one. */
  externalId: string | null;
  /**
   * The transaction's moment. Wall-clock as printed on the statement, kept in
   * UTC so it displays back unchanged (`timeZone: 'UTC'`). When `hasTime` is
   * false only the date part is meaningful (time is midnight).
   */
  occurredAt: Date;
  hasTime: boolean;
  description: string;
  /** Minor units, signed — negative = money out. */
  amountMinor: number;
  currency: string;
  rawType: string | null;
  runningBalanceMinor: number | null;
  raw: Record<string, string>;
}

export interface ParsedStatement {
  format: 'wise' | 'monzo' | 'revolut' | 'starling' | 'generic';
  /** Human label for the source account, e.g. "Wise". */
  source: string;
  rows: ParsedRow[];
  periodStart: Date | null;
  periodEnd: Date | null;
}

export class StatementParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatementParseError';
  }
}

const cell = (row: readonly string[], i: number): string => row[i] ?? '';

// --- CSV tokenizer (RFC 4180-ish) -----------------------------------------

function sniffDelimiter(headerLine: string): string {
  const counts: [string, number][] = [
    [',', (headerLine.match(/,/g) ?? []).length],
    [';', (headerLine.match(/;/g) ?? []).length],
    ['\t', (headerLine.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]?.[0] ?? ',';
}

function parseCsv(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, '');
  const nl = cleaned.indexOf('\n');
  const delimiter = sniffDelimiter(nl === -1 ? cleaned : cleaned.slice(0, nl));

  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i += 1) {
    const c = cleaned[i];
    if (inQuotes) {
      if (c === '"') {
        if (cleaned[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c ?? '';
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// --- header matching -----------------------------------------------------

const norm = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ');
const bareHeader = (s: string): string =>
  norm(s).replace(/\s*\([^)]*\)\s*$/, '');

const HEADER_ALIASES = {
  // A single column carrying date *and* time (Wise "Date Time", Revolut's
  // "Started/Completed Date", generic "Date / Time"). Preferred when present.
  datetime: [
    'date time',
    'datetime',
    'date / time',
    'date & time',
    'date completed',
    'completed date',
    'started date',
    'timestamp',
  ],
  date: [
    'date',
    'transaction date',
    'booking date',
    'value date',
    'posting date',
  ],
  time: ['time', 'transaction time'],
  amount: ['amount', 'value', 'transaction amount'],
  debit: [
    'paid out',
    'money out',
    'debit',
    'withdrawn',
    'withdrawal',
    'debit amount',
    'amount debited',
  ],
  credit: [
    'paid in',
    'money in',
    'credit',
    'deposit',
    'credit amount',
    'amount credited',
  ],
  currency: ['currency', 'ccy', 'currency code', 'wallet currency'],
  balance: [
    'running balance',
    'balance',
    'balance after transaction',
    'account balance',
  ],
  id: [
    'transferwise id',
    'wise id',
    'transaction id',
    'id',
    'reference number',
    'transaction reference',
  ],
  type: ['type', 'transaction type', 'category', 'spending category'],
} as const;

type Role = keyof typeof HEADER_ALIASES;

// Description candidates, best first.
const DESCRIPTION_ALIASES = [
  'description',
  'merchant',
  'counter party',
  'counterparty',
  'payee name',
  'payee',
  'name',
  'narrative',
  'details',
  'payment reference',
  'reference',
  'memo',
  'notes',
  'note',
];

interface ColumnMap {
  datetime: number;
  date: number;
  time: number;
  amount: number;
  debit: number;
  credit: number;
  currency: number;
  balance: number;
  id: number;
  type: number;
  description: number;
  headerCurrency: string | null;
}

function findHeaderRow(rows: string[][]): number {
  const wanted = new Set<string>([
    ...HEADER_ALIASES.datetime,
    ...HEADER_ALIASES.date,
    ...HEADER_ALIASES.amount,
    ...HEADER_ALIASES.debit,
    ...HEADER_ALIASES.credit,
    ...DESCRIPTION_ALIASES,
  ]);
  for (let i = 0; i < Math.min(rows.length, 25); i += 1) {
    const cells = (rows[i] ?? []).map(bareHeader);
    const hits = cells.filter((c) => wanted.has(c)).length;
    const has = (aliases: readonly string[]) =>
      cells.some((c) => aliases.includes(c));
    const hasDate =
      has(HEADER_ALIASES.date) || has(HEADER_ALIASES.datetime);
    const hasMoney =
      has(HEADER_ALIASES.amount) ||
      has(HEADER_ALIASES.debit) ||
      has(HEADER_ALIASES.credit);
    if (hits >= 3 || (hasDate && hasMoney)) return i;
  }
  return -1;
}

function buildColumnMap(header: readonly string[]): ColumnMap {
  const map: ColumnMap = {
    datetime: -1,
    date: -1,
    time: -1,
    amount: -1,
    debit: -1,
    credit: -1,
    currency: -1,
    balance: -1,
    id: -1,
    type: -1,
    description: -1,
    headerCurrency: null,
  };
  const bare = header.map(bareHeader);

  (Object.keys(HEADER_ALIASES) as Role[]).forEach((role) => {
    const aliases = HEADER_ALIASES[role] as readonly string[];
    for (let i = 0; i < bare.length; i += 1) {
      if (map[role] === -1 && aliases.includes(cell(bare, i))) map[role] = i;
    }
  });

  header.forEach((h, i) => {
    const m = norm(h).match(/\(([a-z]{3})\)\s*$/);
    const b = cell(bare, i);
    if (m && m[1] && (b === 'amount' || b === 'value' || b === 'balance')) {
      map.headerCurrency = m[1].toUpperCase();
    }
  });

  outer: for (const alias of DESCRIPTION_ALIASES) {
    for (let i = 0; i < bare.length; i += 1) {
      if (cell(bare, i) === alias) {
        map.description = i;
        break outer;
      }
    }
  }

  return map;
}

// --- value parsing ------------------------------------------------------

function normalizeNumber(str: string): string {
  const hasComma = str.includes(',');
  const hasDot = str.includes('.');
  if (hasComma && hasDot) {
    return str.lastIndexOf(',') > str.lastIndexOf('.')
      ? str.replace(/\./g, '').replace(',', '.')
      : str.replace(/,/g, '');
  }
  if (hasComma) {
    return /,\d{1,2}$/.test(str) ? str.replace(',', '.') : str.replace(/,/g, '');
  }
  return str;
}

export function parseAmount(input: string): number | null {
  if (!input) return null;
  let str = input.trim().replace(/[£$€\s]/g, '');
  if (!str) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(str)) {
    sign = -1;
    str = str.slice(1, -1);
  }
  if (/cr$/i.test(str)) str = str.replace(/cr$/i, '');
  else if (/(dr|db)$/i.test(str)) {
    sign = -1;
    str = str.replace(/(dr|db)$/i, '');
  }
  if (str.startsWith('-')) {
    sign = -1;
    str = str.slice(1);
  } else if (str.startsWith('+')) {
    str = str.slice(1);
  } else if (str.endsWith('-')) {
    sign = -1;
    str = str.slice(0, -1);
  }
  const n = Number(normalizeNumber(str));
  if (Number.isNaN(n)) return null;
  return Math.round(Math.abs(n) * 100) * sign;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function parseDate(input: string, dayFirst = true): Date | null {
  if (!input) return null;
  const s = input.trim();

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    let day: number;
    let month: number;
    if (a > 12 && b <= 12) {
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      day = b;
      month = a;
    } else if (dayFirst) {
      day = a;
      month = b;
    } else {
      day = b;
      month = a;
    }
    const d = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const named = s.match(/^(\d{1,2})[ -]([A-Za-z]{3,})[ -](\d{4})/);
  if (named && named[2]) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (month != null) {
      const d = new Date(Date.UTC(Number(named[3]), month, Number(named[1])));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/** Pull `HH:MM(:SS)` out of anywhere in a string (ignores any `.mmm`). */
function extractTime(input: string): { h: number; m: number; s: number } | null {
  const m = input.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = m[3] ? Number(m[3]) : 0;
  if (h > 23 || min > 59 || sec > 59) return null;
  return { h, m: min, s: sec };
}

/**
 * Parse a date, and a time from either the same string (a "Date Time"
 * column) or a separate time cell. Returns the moment as UTC wall-clock so
 * it renders back unchanged, plus whether a real time was found.
 */
export function parseDateTime(
  dateStr: string,
  timeStr = '',
  dayFirst = true,
): { date: Date; hasTime: boolean } | null {
  const base = parseDate(dateStr, dayFirst);
  if (!base) return null;
  const time = extractTime(timeStr) ?? extractTime(dateStr);
  if (!time) return { date: base, hasTime: false };
  return {
    date: new Date(
      Date.UTC(
        base.getUTCFullYear(),
        base.getUTCMonth(),
        base.getUTCDate(),
        time.h,
        time.m,
        time.s,
      ),
    ),
    hasTime: true,
  };
}

// --- format detection --------------------------------------------------

function detectFormat(headerNorm: string[]): {
  format: ParsedStatement['format'];
  source: string;
} {
  const set = new Set(headerNorm);
  if (set.has('transferwise id') || set.has('wise id')) {
    return { format: 'wise', source: 'Wise' };
  }
  if (set.has('started date') && set.has('completed date') && set.has('state')) {
    return { format: 'revolut', source: 'Revolut' };
  }
  if (
    set.has('transaction id') &&
    (set.has('money out') || set.has('money in')) &&
    set.has('emoji')
  ) {
    return { format: 'monzo', source: 'Monzo' };
  }
  if (set.has('counter party') && set.has('spending category')) {
    return { format: 'starling', source: 'Starling' };
  }
  return { format: 'generic', source: 'Statement' };
}

// --- main --------------------------------------------------------------

export function parseStatement(
  text: string,
  opts: { defaultCurrency: string },
): ParsedStatement {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    throw new StatementParseError('That file looks empty.');
  }

  const headerIdx = findHeaderRow(rows);
  const header = headerIdx === -1 ? undefined : rows[headerIdx];
  if (!header) {
    throw new StatementParseError(
      "Couldn't find a transactions table in that file — it needs a header row with at least a date column and an amount (or paid in / paid out) column.",
    );
  }

  const headerNorm = header.map(bareHeader);
  const col = buildColumnMap(header);
  const { format, source } = detectFormat(headerNorm);

  if (col.date === -1 && col.datetime === -1) {
    throw new StatementParseError("Couldn't find a date column in that file.");
  }
  const dateCol = col.datetime !== -1 ? col.datetime : col.date;
  if (col.amount === -1 && col.debit === -1 && col.credit === -1) {
    throw new StatementParseError(
      "Couldn't find an amount column (or paid in / paid out columns) in that file.",
    );
  }

  const fallbackCurrency = col.headerCurrency ?? opts.defaultCurrency;
  const parsed: ParsedRow[] = [];

  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const cells = rows[i] ?? [];
    const get = (idx: number): string =>
      idx >= 0 && idx < cells.length ? cell(cells, idx).trim() : '';

    const moment = parseDateTime(
      get(dateCol),
      col.time !== -1 ? get(col.time) : '',
    );
    if (!moment) continue;

    let amountMinor: number | null = null;
    if (col.amount !== -1) amountMinor = parseAmount(get(col.amount));
    if (amountMinor == null && (col.debit !== -1 || col.credit !== -1)) {
      const debitRaw = get(col.debit);
      const creditRaw = get(col.credit);
      if (debitRaw || creditRaw) {
        const debit = parseAmount(debitRaw) ?? 0;
        const credit = parseAmount(creditRaw) ?? 0;
        amountMinor = Math.abs(credit) - Math.abs(debit);
      }
    }
    if (amountMinor == null) continue;

    const raw: Record<string, string> = {};
    header.forEach((h, hi) => {
      if (h) raw[h] = get(hi);
    });

    const desc =
      (col.description !== -1 && get(col.description)) ||
      (col.type !== -1 && get(col.type)) ||
      'Transaction';

    parsed.push({
      externalId: col.id !== -1 ? get(col.id) || null : null,
      occurredAt: moment.date,
      hasTime: moment.hasTime,
      description: desc,
      amountMinor,
      currency:
        (col.currency !== -1 && get(col.currency)) || fallbackCurrency,
      rawType: col.type !== -1 ? get(col.type) || null : null,
      runningBalanceMinor:
        col.balance !== -1 ? parseAmount(get(col.balance)) : null,
      raw,
    });
  }

  if (parsed.length === 0) {
    throw new StatementParseError(
      'Found the table but none of the rows had a readable date and amount.',
    );
  }

  const times = parsed.map((r) => r.occurredAt.getTime());
  return {
    format,
    source,
    rows: parsed,
    periodStart: new Date(Math.min(...times)),
    periodEnd: new Date(Math.max(...times)),
  };
}

/**
 * Stable per-transaction key for dedup: the bank's own id when present,
 * otherwise a hash of the content that would be identical across two exports
 * of the same transaction.
 */
export function dedupKey(row: ParsedRow, source: string): string {
  if (row.externalId) return `${source}:${row.externalId}`.slice(0, 200);
  const desc = row.description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const day = row.occurredAt.toISOString().slice(0, 10);
  return `${source}|${day}|${row.amountMinor}|${row.currency}|${desc}`.slice(
    0,
    200,
  );
}
