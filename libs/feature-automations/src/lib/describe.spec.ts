import { describe, expect, it } from 'vitest';
import { describeActions, describeConditions } from './describe';
import type { AutomationLookups } from './queries';

const lookups: AutomationLookups = {
  accounts: [{ id: 'a1', name: 'Business', color: '#000' }],
  banks: [{ id: 'b1', name: 'Monzo', color: '#000' }],
  methods: [{ id: 'm1', name: 'Amex' }],
  tags: [],
  budgets: [{ id: 'bd1', name: 'Groceries' }],
};

describe('describeConditions', () => {
  it('joins patterns with "and", quoting text values', () => {
    expect(
      describeConditions('review_expense_created', [
        { field: 'name', operator: 'contains', value: 'Pret' },
        { field: 'amount', operator: 'lt', value: '5' },
      ]),
    ).toBe('Merchant name contains "Pret" and Amount is less than 5');
  });

  it('spells out a between range', () => {
    expect(
      describeConditions('review_expense_created', [
        { field: 'amount', operator: 'between', value: '1', value2: '9' },
      ]),
    ).toBe('Amount is between 1 and 9');
  });
});

describe('describeActions', () => {
  it('returns one labelled line per action with resolved names', () => {
    const lines = describeActions(
      [
        { type: 'set_tags', tags: ['coffee', 'work'] },
        { type: 'set_account', accountId: 'a1' },
        { type: 'set_method', methodId: 'm1' },
        {
          type: 'log_expense',
          tags: ['x'],
          accountId: 'a1',
          bankId: 'b1',
          budgetId: 'bd1',
          name: 'Coffee',
          notes: null,
          url: null,
        },
        { type: 'notify', channel: 'email', message: 'hi <title>' },
      ],
      lookups,
    );
    expect(lines[0]).toEqual({ label: 'Set tags', detail: 'coffee, work' });
    expect(lines[1]).toEqual({ label: 'Set the account', detail: 'Business' });
    expect(lines[2]).toEqual({
      label: 'Set the payment method',
      detail: 'Amex',
    });
    expect(lines[3]?.detail).toContain('title “Coffee”');
    expect(lines[3]?.detail).toContain('Business');
    expect(lines[3]?.detail).toContain('bank Monzo');
    expect(lines[3]?.detail).toContain('budget Groceries');
    expect(lines[4]).toEqual({
      label: 'Send a notification',
      detail: 'Email only · “hi <title>”',
    });
  });
});
