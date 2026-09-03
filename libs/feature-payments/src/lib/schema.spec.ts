import { describe, expect, it } from 'vitest';
import { paymentFormSchema } from './schema';

const base = {
  name: 'Rent',
  amount: '1450',
  currency: 'EUR',
  recurrence: 'monthly' as const,
  anchorDate: '2026-01-01',
  dayOfMonth: '1',
};

describe('paymentFormSchema', () => {
  it('treats a blank "ends on" as unset, not a bad date', () => {
    const parsed = paymentFormSchema.safeParse({ ...base, endsOn: '' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.endsOn).toBeNull();
  });

  it('treats a blank service URL as unset', () => {
    const parsed = paymentFormSchema.safeParse({ ...base, url: '' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.url).toBeNull();
  });

  it('still keeps a real end date', () => {
    const parsed = paymentFormSchema.safeParse({
      ...base,
      endsOn: '2026-12-01',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.endsOn).toBe('2026-12-01');
  });

  it('still rejects an end date before the first payment', () => {
    const parsed = paymentFormSchema.safeParse({
      ...base,
      endsOn: '2025-01-01',
    });
    expect(parsed.success).toBe(false);
  });

  it('keeps a valid service URL', () => {
    const parsed = paymentFormSchema.safeParse({
      ...base,
      url: 'https://netflix.com',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.url).toBe('https://netflix.com');
  });

  it('fills in the scheme for a bare domain', () => {
    const parsed = paymentFormSchema.safeParse({ ...base, url: 'netflix.com' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.url).toBe('https://netflix.com');
  });

  it('defaults to a fixed amount', () => {
    const parsed = paymentFormSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.amountKind).toBe('fixed');
      expect(parsed.data.unitName).toBeNull();
      expect(parsed.data.defaultUnits).toBe('1');
    }
  });

  it('requires a unit name for a per-unit amount', () => {
    const parsed = paymentFormSchema.safeParse({
      ...base,
      amountKind: 'per_unit',
    });
    expect(parsed.success).toBe(false);
  });

  it('requires a day of the month for a recurring payment', () => {
    const { dayOfMonth: _omit, ...noDay } = base;
    void _omit;
    expect(paymentFormSchema.safeParse(noDay).success).toBe(false);
    expect(
      paymentFormSchema.safeParse({ ...noDay, recurrence: 'one_time' }).success,
    ).toBe(true);
  });

  it('rejects a day of the month outside 1–31', () => {
    expect(
      paymentFormSchema.safeParse({ ...base, dayOfMonth: '32' }).success,
    ).toBe(false);
  });

  it('keeps the unit name and quantity for a per-unit amount', () => {
    const parsed = paymentFormSchema.safeParse({
      ...base,
      amountKind: 'per_unit',
      amount: '45',
      unitName: 'visit',
      defaultUnits: '3',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.unitName).toBe('visit');
      expect(parsed.data.defaultUnits).toBe('3');
    }
  });

  it('requires at least one record for a group amount', () => {
    const parsed = paymentFormSchema.safeParse({
      ...base,
      amount: '',
      amountKind: 'group',
      lineItems: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a group amount with records and ignores the amount field', () => {
    const parsed = paymentFormSchema.safeParse({
      ...base,
      amount: '',
      amountKind: 'group',
      lineItems: [
        { id: 'a', name: 'Netflix', value: '12.99', currency: 'GBP' },
        { id: 'b', name: 'Spotify', value: '11', currency: 'EUR' },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.lineItems).toHaveLength(2);
      expect(parsed.data.lineItems[0]?.currency).toBe('GBP');
      expect(parsed.data.lineItems[1]?.iconKey).toBeNull();
    }
  });

  it('rejects a record with a non-positive value', () => {
    const parsed = paymentFormSchema.safeParse({
      ...base,
      amount: '',
      amountKind: 'group',
      lineItems: [{ id: 'a', name: 'Bad', value: '0', currency: 'EUR' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('defaults to no fee', () => {
    const parsed = paymentFormSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.feeKind).toBe('none');
  });

  it('needs a value once a fee kind is chosen', () => {
    expect(
      paymentFormSchema.safeParse({ ...base, feeKind: 'percent' }).success,
    ).toBe(false);
    expect(
      paymentFormSchema.safeParse({
        ...base,
        feeKind: 'percent',
        feeValue: '2.5',
      }).success,
    ).toBe(true);
  });
});
