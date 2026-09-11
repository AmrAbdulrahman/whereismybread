import { describe, expect, it } from 'vitest';
import {
  debtFormSchema,
  debtLineSchema,
  debtMetaSchema,
  otpVerifySchema,
  personFormSchema,
  repaymentFormSchema,
  thingFormSchema,
} from './schema';

const PERSON = '11111111-1111-4111-8111-111111111111';
const line = (over: Record<string, unknown> = {}) => ({
  amount: '10',
  denomKind: 'money',
  currency: 'usd',
  ...over,
});

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

describe('debtLineSchema', () => {
  it('normalises the currency and defaults the gold type', () => {
    const parsed = debtLineSchema.parse({ amount: '5', currency: 'gbp' });
    expect(parsed.currency).toBe('GBP');
    expect(parsed.denomKind).toBe('money');

    const gold = debtLineSchema.parse({ amount: '10', denomKind: 'gold' });
    expect(gold.goldType).toBe('k21');
    expect(gold.goldUnit).toBe('g');
  });

  it('carries a thing denomination', () => {
    const parsed = debtLineSchema.parse({
      amount: '2',
      denomKind: 'thing',
      thingId: PERSON,
      thingName: 'Rolex Submariner',
      goldUnit: 'piece',
    });
    expect(parsed.denomKind).toBe('thing');
    expect(parsed.thingId).toBe(PERSON);
    expect(parsed.thingName).toBe('Rolex Submariner');
  });

  it('rejects a zero or negative amount', () => {
    expect(debtLineSchema.safeParse(line({ amount: '0' })).success).toBe(false);
    expect(debtLineSchema.safeParse(line({ amount: '-5' })).success).toBe(false);
  });
});

describe('debtFormSchema', () => {
  it('accepts a basket of several mixed-denomination rows', () => {
    const parsed = debtFormSchema.parse({
      personId: PERSON,
      direction: 'they_owe',
      incurredOn: '2026-09-10',
      description: '  taxi ',
      notes: '',
      lines: [
        line({ amount: '10', currency: 'usd' }),
        line({ amount: '30', currency: 'eur' }),
        line({ denomKind: 'gold', goldType: 'bar_oz', amount: '1' }),
      ],
    });
    expect(parsed.description).toBe('taxi');
    expect(parsed.notes).toBeNull();
    expect(parsed.attachments).toEqual([]);
    expect(parsed.lines).toHaveLength(3);
    expect(parsed.lines.map((l) => l.currency)).toEqual(['USD', 'EUR', 'USD']);
    expect(parsed.lines.map((l) => l.denomKind)).toEqual([
      'money',
      'money',
      'gold',
    ]);
  });

  it('needs at least one row', () => {
    expect(
      debtFormSchema.safeParse({
        personId: PERSON,
        direction: 'they_owe',
        incurredOn: '2026-09-10',
        lines: [],
      }).success,
    ).toBe(false);
  });

  it('requires the incurred date', () => {
    expect(
      debtFormSchema.safeParse({
        personId: PERSON,
        direction: 'they_owe',
        lines: [line()],
      }).success,
    ).toBe(false);
  });

});

describe('thingFormSchema', () => {
  it('normalises name + currency and defaults value to 0', () => {
    const parsed = thingFormSchema.parse({
      name: '  Rolex Submariner ',
      logoUrl: '',
      valueCurrency: 'usd',
    });
    expect(parsed).toMatchObject({
      name: 'Rolex Submariner',
      logoUrl: null,
      unit: 'piece',
      value: '0',
      valueCurrency: 'USD',
    });
  });

  it('rejects a nameless thing and a non-image logo', () => {
    expect(thingFormSchema.safeParse({ name: '' }).success).toBe(false);
    expect(
      thingFormSchema.safeParse({ name: 'x', logoUrl: 'http://nope' }).success,
    ).toBe(false);
  });
});

describe('debtMetaSchema', () => {
  it('validates metadata without any rows', () => {
    const parsed = debtMetaSchema.parse({
      personId: PERSON,
      direction: 'i_owe',
      incurredOn: '2026-09-10',
      description: ' dinner ',
      notes: '',
    });
    expect(parsed.description).toBe('dinner');
    expect(parsed.notes).toBeNull();
  });
});

describe('repaymentFormSchema', () => {
  it('needs an ISO-shaped date and carries its own denomination', () => {
    expect(
      repaymentFormSchema.safeParse({
        amount: '10',
        occurredOn: 'tomorrow',
      }).success,
    ).toBe(false);
    const parsed = repaymentFormSchema.parse({
      amount: '10',
      denomKind: 'money',
      currency: 'usd',
      occurredOn: '2026-09-10',
    });
    expect(parsed.currency).toBe('USD');
    expect(parsed.note).toBeNull();
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
