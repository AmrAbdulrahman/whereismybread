import { describe, expect, it } from 'vitest';
import { expenseFormSchema } from './expense-schema';

const base = {
  name: 'Coffee',
  date: '2026-09-04',
  amount: '4.50',
  currency: 'EUR',
};

describe('expenseFormSchema', () => {
  it('treats a blank budget as unset, not an error', () => {
    const parsed = expenseFormSchema.safeParse({ ...base, budgetId: '' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.budgetId).toBeNull();
  });

  it('accepts an omitted budget the same way', () => {
    const parsed = expenseFormSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.budgetId).toBeNull();
  });

  it('keeps a real budget id', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const parsed = expenseFormSchema.safeParse({ ...base, budgetId: id });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.budgetId).toBe(id);
  });

  it('rejects a badly-formed budget id', () => {
    expect(
      expenseFormSchema.safeParse({ ...base, budgetId: 'not-a-uuid' })
        .success,
    ).toBe(false);
  });

  it('requires a date', () => {
    const { date: _omit, ...noDate } = base;
    void _omit;
    expect(expenseFormSchema.safeParse(noDate).success).toBe(false);
  });

  it('rejects a malformed date', () => {
    expect(
      expenseFormSchema.safeParse({ ...base, date: '04/09/2026' }).success,
    ).toBe(false);
  });

  it('requires a positive amount', () => {
    expect(
      expenseFormSchema.safeParse({ ...base, amount: '0' }).success,
    ).toBe(false);
    expect(
      expenseFormSchema.safeParse({ ...base, amount: '' }).success,
    ).toBe(false);
  });

  it('treats a blank note as unset', () => {
    const parsed = expenseFormSchema.safeParse({ ...base, notes: '' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.notes).toBeNull();
  });
});
