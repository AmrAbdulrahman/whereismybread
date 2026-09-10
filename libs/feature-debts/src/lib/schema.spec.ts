import { describe, expect, it } from 'vitest';
import {
  debtFormSchema,
  newDebtsSchema,
  otpVerifySchema,
  personFormSchema,
  repaymentFormSchema,
} from './schema';

describe('personFormSchema', () => {
  it('lower-cases the email and defaults the photo to null', () => {
    const parsed = personFormSchema.parse({
      name: '  Sarah  ',
      email: 'Sarah@Example.com',
      photoUrl: '',
    });
    expect(parsed).toEqual({
      name: 'Sarah',
      email: 'sarah@example.com',
      photoUrl: null,
    });
  });

  it('rejects a bad email', () => {
    expect(personFormSchema.safeParse({ name: 'X', email: 'nope' }).success).toBe(
      false,
    );
  });
});

describe('debtFormSchema', () => {
  it('accepts a valid debt and normalises the currency', () => {
    const parsed = debtFormSchema.parse({
      personId: '11111111-1111-4111-8111-111111111111',
      direction: 'i_owe',
      amount: '120.50',
      currency: 'gbp',
      incurredOn: '2026-09-10',
      description: '  taxi ',
      notes: '',
    });
    expect(parsed.currency).toBe('GBP');
    expect(parsed.description).toBe('taxi');
    expect(parsed.notes).toBeNull();
    expect(parsed.attachments).toEqual([]);
  });

  it('accepts a gold debt and defaults the type', () => {
    const parsed = debtFormSchema.parse({
      personId: '11111111-1111-4111-8111-111111111111',
      direction: 'they_owe',
      denomKind: 'gold',
      amount: '10',
      incurredOn: '2026-09-10',
    });
    expect(parsed.denomKind).toBe('gold');
    expect(parsed.goldType).toBe('k21');
    expect(parsed.goldUnit).toBe('g');
  });

  it('needs a label for a custom gold type', () => {
    const base = {
      personId: '11111111-1111-4111-8111-111111111111',
      direction: 'they_owe' as const,
      denomKind: 'gold' as const,
      goldType: 'custom',
      amount: '3',
      incurredOn: '2026-09-10',
    };
    expect(debtFormSchema.safeParse(base).success).toBe(false);
    expect(
      debtFormSchema.safeParse({ ...base, goldLabel: '22K bangle' }).success,
    ).toBe(true);
  });

  it('requires the incurred date', () => {
    expect(
      debtFormSchema.safeParse({
        personId: '11111111-1111-4111-8111-111111111111',
        direction: 'they_owe',
        amount: '10',
        currency: 'EUR',
      }).success,
    ).toBe(false);
  });

  it('rejects a zero or negative amount', () => {
    const base = {
      personId: '11111111-1111-4111-8111-111111111111',
      direction: 'they_owe' as const,
      currency: 'EUR',
      incurredOn: '2026-09-10',
    };
    expect(debtFormSchema.safeParse({ ...base, amount: '0' }).success).toBe(false);
    expect(debtFormSchema.safeParse({ ...base, amount: '-5' }).success).toBe(
      false,
    );
  });
});

describe('newDebtsSchema', () => {
  const PERSON = '11111111-1111-4111-8111-111111111111';
  const line = (over: Record<string, unknown> = {}) => ({
    amount: '10',
    denomKind: 'money',
    currency: 'usd',
    occurredOn: '2026-09-10',
    ...over,
  });

  it('accepts several mixed-denomination lines with per-line note + date', () => {
    const parsed = newDebtsSchema.parse({
      personId: PERSON,
      direction: 'they_owe',
      lines: [
        line({ amount: '10', currency: 'usd', note: '  lunch ' }),
        line({ amount: '30', currency: 'eur' }),
        line({ denomKind: 'gold', goldType: 'bar_oz', amount: '1' }),
      ],
    });
    expect(parsed.lines).toHaveLength(3);
    expect(parsed.lines.map((l) => l.currency)).toEqual(['USD', 'EUR', 'USD']);
    expect(parsed.lines.map((l) => l.note)).toEqual(['lunch', '', '']);
    expect(parsed.lines.map((l) => l.denomKind)).toEqual([
      'money',
      'money',
      'gold',
    ]);
  });

  it('needs at least one line', () => {
    expect(
      newDebtsSchema.safeParse({ personId: PERSON, direction: 'they_owe', lines: [] })
        .success,
    ).toBe(false);
  });

  it('requires a label on a custom-gold line', () => {
    const bad = {
      personId: PERSON,
      direction: 'i_owe',
      lines: [line({ denomKind: 'gold', goldType: 'custom', amount: '2' })],
    };
    expect(newDebtsSchema.safeParse(bad).success).toBe(false);
    const good = {
      ...bad,
      lines: [
        line({
          denomKind: 'gold',
          goldType: 'custom',
          amount: '2',
          goldLabel: 'scrap',
        }),
      ],
    };
    expect(newDebtsSchema.safeParse(good).success).toBe(true);
  });
});

describe('repaymentFormSchema', () => {
  it('needs an ISO-shaped date', () => {
    expect(
      repaymentFormSchema.safeParse({ amount: '10', occurredOn: 'tomorrow' })
        .success,
    ).toBe(false);
    expect(
      repaymentFormSchema.safeParse({ amount: '10', occurredOn: '2026-09-10' })
        .success,
    ).toBe(true);
  });
});

describe('otpVerifySchema', () => {
  it('requires a 6-digit code', () => {
    const base = { email: 'a@b.com' };
    expect(otpVerifySchema.safeParse({ ...base, code: '123456' }).success).toBe(
      true,
    );
    expect(otpVerifySchema.safeParse({ ...base, code: '12345' }).success).toBe(
      false,
    );
    expect(otpVerifySchema.safeParse({ ...base, code: 'abcdef' }).success).toBe(
      false,
    );
  });
});
