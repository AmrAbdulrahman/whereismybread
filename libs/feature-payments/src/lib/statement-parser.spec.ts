import { describe, expect, it } from 'vitest';
import {
  dedupKey,
  parseAmount,
  parseDate,
  parseDateTime,
  parseStatement,
  StatementParseError,
} from './statement-parser';

describe('parseAmount', () => {
  it('reads plain and signed decimals', () => {
    expect(parseAmount('12.50')).toBe(1250);
    expect(parseAmount('-12.50')).toBe(-1250);
    expect(parseAmount('+3.00')).toBe(300);
  });

  it('handles currency symbols, thousands and parentheses', () => {
    expect(parseAmount('£1,234.56')).toBe(123456);
    expect(parseAmount('(45.00)')).toBe(-4500);
    expect(parseAmount('1.234,56')).toBe(123456);
    expect(parseAmount('100,00')).toBe(10000);
  });

  it('handles CR / DR suffixes and trailing minus', () => {
    expect(parseAmount('50.00 CR')).toBe(5000);
    expect(parseAmount('50.00DR')).toBe(-5000);
    expect(parseAmount('50.00-')).toBe(-5000);
  });

  it('returns null for junk', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('n/a')).toBeNull();
  });
});

describe('parseDate', () => {
  it('reads ISO and UK day-first formats', () => {
    expect(parseDate('2026-03-14')?.toISOString().slice(0, 10)).toBe('2026-03-14');
    expect(parseDate('14/03/2026')?.toISOString().slice(0, 10)).toBe('2026-03-14');
    expect(parseDate('14-03-2026')?.toISOString().slice(0, 10)).toBe('2026-03-14');
    expect(parseDate('9 Mar 2026')?.toISOString().slice(0, 10)).toBe('2026-03-09');
  });

  it('disambiguates when a component is > 12', () => {
    expect(parseDate('03/14/2026')?.toISOString().slice(0, 10)).toBe('2026-03-14');
  });
});

describe('parseDateTime', () => {
  it('is date-only when no time is present', () => {
    const r = parseDateTime('14-03-2026');
    expect(r?.hasTime).toBe(false);
    expect(r?.date.toISOString()).toBe('2026-03-14T00:00:00.000Z');
  });

  it('reads a time from a combined "Date Time" value (Wise), dropping millis', () => {
    const r = parseDateTime('06-09-2026 16:57:47.398');
    expect(r?.hasTime).toBe(true);
    expect(r?.date.toISOString()).toBe('2026-09-06T16:57:47.000Z');
  });

  it('reads a time from a separate time cell', () => {
    const r = parseDateTime('06/09/2026', '09:05');
    expect(r?.hasTime).toBe(true);
    expect(r?.date.toISOString()).toBe('2026-09-06T09:05:00.000Z');
  });
});

const WISE_CSV = `"TransferWise ID","Date","Date Time","Amount","Currency","Description","Payment Reference","Running Balance","Payer Name","Payee Name","Merchant"
"TRANSFER-111","14-03-2026","14-03-2026 08:12:03.100","-12.50","GBP","Card transaction of 12.50 GBP issued by TESCO","","487.50","","","Tesco"
"TRANSFER-112","15-03-2026","15-03-2026 00:00:00.000","1000.00","GBP","Received money from ACME LTD","salary","1487.50","ACME LTD","",""
"CARD-113","16-03-2026","16-03-2026 19:44:00.000","-4.20","GBP","Coffee","","1483.30","","","Pret"`;

describe('parseStatement (Wise)', () => {
  it('detects the format and maps the columns', () => {
    const s = parseStatement(WISE_CSV, { defaultCurrency: 'GBP' });
    expect(s.format).toBe('wise');
    expect(s.source).toBe('Wise');
    expect(s.rows).toHaveLength(3);

    const [first, second] = s.rows;
    expect(first?.externalId).toBe('TRANSFER-111');
    expect(first?.amountMinor).toBe(-1250);
    expect(first?.currency).toBe('GBP');
    expect(first?.occurredAt.toISOString()).toBe('2026-03-14T08:12:03.000Z');
    expect(first?.hasTime).toBe(true);
    expect(first?.runningBalanceMinor).toBe(48750);
    expect(second?.amountMinor).toBe(100000);
  });

  it('spans the statement period', () => {
    const s = parseStatement(WISE_CSV, { defaultCurrency: 'GBP' });
    expect(s.periodStart?.toISOString().slice(0, 10)).toBe('2026-03-14');
    expect(s.periodEnd?.toISOString().slice(0, 10)).toBe('2026-03-16');
  });
});

const DEBIT_CREDIT_CSV = `Date,Description,Paid Out,Paid In,Balance
01/04/2026,DIRECT DEBIT - GYM,25.00,,975.00
03/04/2026,REFUND,,9.99,984.99`;

describe('parseStatement (paid in / paid out columns)', () => {
  it('nets debit and credit into a signed amount', () => {
    const s = parseStatement(DEBIT_CREDIT_CSV, { defaultCurrency: 'GBP' });
    expect(s.format).toBe('generic');
    expect(s.rows[0]?.amountMinor).toBe(-2500);
    expect(s.rows[1]?.amountMinor).toBe(999);
    expect(s.rows[0]?.currency).toBe('GBP');
  });
});

describe('parseStatement errors', () => {
  it('rejects a file with no recognizable table', () => {
    expect(() =>
      parseStatement('hello\nworld\n', { defaultCurrency: 'GBP' }),
    ).toThrow(StatementParseError);
  });
});

describe('dedupKey', () => {
  it('uses the external id when present', () => {
    const s = parseStatement(WISE_CSV, { defaultCurrency: 'GBP' });
    const [row] = s.rows;
    expect(row && dedupKey(row, s.source)).toBe('Wise:TRANSFER-111');
  });

  it('falls back to a stable content hash', () => {
    const s = parseStatement(DEBIT_CREDIT_CSV, { defaultCurrency: 'GBP' });
    const [row] = s.rows;
    if (!row) throw new Error('expected a parsed row');
    const key = dedupKey(row, s.source);
    expect(key).toBe(dedupKey(row, s.source));
    expect(key).toContain('2026-04-01');
    expect(key).toContain('-2500');
  });
});
