import { describe, expect, it } from 'vitest';
import {
  debtFormSchema,
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
