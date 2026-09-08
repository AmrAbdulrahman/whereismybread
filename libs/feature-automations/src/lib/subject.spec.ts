import { describe, expect, it } from 'vitest';
import { evaluateConditions } from '@wib/domain';
import { buildRecordSubject, buildReviewSubject } from './subject';

describe('buildReviewSubject', () => {
  it('cleans the merchant, derives direction, converts amount', () => {
    const s = buildReviewSubject({
      description: 'Card payment to Aujla Superstore',
      rawType: 'CARD',
      amountMinor: -435,
      currency: 'GBP',
      bankName: 'Monzo',
    });
    expect(s.name).toBe('Aujla Superstore');
    expect(s.direction).toBe('out');
    expect(s.amount).toBe(4.35);
    expect(s.bank).toBe('Monzo');
    expect(s.rawType).toBe('CARD');
  });

  it('an inbound amount is direction "in"', () => {
    const s = buildReviewSubject({
      description: 'Salary',
      rawType: null,
      amountMinor: 250000,
      currency: 'GBP',
      bankName: '',
    });
    expect(s.direction).toBe('in');
    expect(s.rawType).toBe('');
  });

  it('feeds the pattern matcher — "Pret under £5" example', () => {
    const s = buildReviewSubject({
      description: 'Pret A Manger',
      rawType: null,
      amountMinor: -480,
      currency: 'GBP',
      bankName: 'Monzo',
    });
    expect(
      evaluateConditions(
        [
          { field: 'name', operator: 'contains', value: 'Pret' },
          { field: 'amount', operator: 'lt', value: '5' },
        ],
        s,
      ),
    ).toBe(true);
  });
});

describe('buildRecordSubject', () => {
  it('carries kind / recurrence / account / method', () => {
    const s = buildRecordSubject({
      kind: 'payment',
      name: 'Spotify',
      amountMinor: 1199,
      currency: 'GBP',
      recurrence: 'monthly',
      accountName: 'Personal',
      methodName: 'Amex',
    });
    expect(s).toMatchObject({
      kind: 'payment',
      amount: 11.99,
      recurrence: 'monthly',
      account: 'Personal',
      method: 'Amex',
    });
  });

  it('defaults optional fields to empty strings', () => {
    const s = buildRecordSubject({
      kind: 'expense',
      name: 'Taxi',
      amountMinor: 2200,
      currency: 'GBP',
    });
    expect(s.recurrence).toBe('');
    expect(s.account).toBe('');
  });
});
