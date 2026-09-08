import { describe, expect, it } from 'vitest';
import {
  actionTypesForTrigger,
  applyTemplate,
  conditionMatches,
  evaluateConditions,
  fieldsForTrigger,
  formatSyncSummary,
  isTerminalAction,
  operatorsForKind,
  templateVars,
  type AutomationCondition,
} from './automations';

const sub = {
  name: 'Pret A Manger',
  description: 'CARD-1 Pret A Manger LONDON',
  amount: 4.35,
  direction: 'out',
  currency: 'GBP',
  bank: 'Monzo',
  rawType: 'CARD',
};

function cond(
  field: string,
  operator: AutomationCondition['operator'],
  value: string,
  value2?: string,
): AutomationCondition {
  return { field, operator, value, value2 };
}

describe('conditionMatches', () => {
  it('contains is case-insensitive', () => {
    expect(conditionMatches(cond('name', 'contains', 'pret'), sub)).toBe(true);
    expect(conditionMatches(cond('name', 'contains', 'greggs'), sub)).toBe(
      false,
    );
  });

  it('not_contains passes when the field is absent', () => {
    expect(conditionMatches(cond('memo', 'not_contains', 'x'), sub)).toBe(true);
    expect(conditionMatches(cond('name', 'not_contains', 'greggs'), sub)).toBe(
      true,
    );
    expect(conditionMatches(cond('name', 'not_contains', 'pret'), sub)).toBe(
      false,
    );
  });

  it('matches falls back to a literal substring on a bad regex', () => {
    expect(conditionMatches(cond('name', 'matches', 'Pret('), sub)).toBe(false);
    expect(conditionMatches(cond('name', 'matches', 'p.et'), sub)).toBe(true);
  });

  it('numeric comparisons coerce strings', () => {
    expect(conditionMatches(cond('amount', 'lt', '5'), sub)).toBe(true);
    expect(conditionMatches(cond('amount', 'gte', '4.35'), sub)).toBe(true);
    expect(conditionMatches(cond('amount', 'gt', '4.35'), sub)).toBe(false);
  });

  it('between is inclusive and order-independent', () => {
    expect(conditionMatches(cond('amount', 'between', '10', '1'), sub)).toBe(
      true,
    );
    expect(conditionMatches(cond('amount', 'between', '1', '3'), sub)).toBe(
      false,
    );
  });

  it('is / is_not compare the whole value', () => {
    expect(conditionMatches(cond('direction', 'is', 'OUT'), sub)).toBe(true);
    expect(conditionMatches(cond('direction', 'is_not', 'in'), sub)).toBe(true);
    expect(conditionMatches(cond('bank', 'is', 'Mon'), sub)).toBe(false);
  });

  it('a present-but-failing field is false for positive ops', () => {
    expect(conditionMatches(cond('amount', 'gt', '100'), sub)).toBe(false);
  });
});

describe('evaluateConditions', () => {
  it('ANDs every condition', () => {
    expect(
      evaluateConditions(
        [cond('name', 'contains', 'Pret'), cond('amount', 'lt', '5')],
        sub,
      ),
    ).toBe(true);
    expect(
      evaluateConditions(
        [cond('name', 'contains', 'Pret'), cond('amount', 'lt', '2')],
        sub,
      ),
    ).toBe(false);
  });

  it('an empty condition list never matches', () => {
    expect(evaluateConditions([], sub)).toBe(false);
  });
});

describe('catalogue helpers', () => {
  it('exposes trigger-appropriate fields and actions', () => {
    expect(fieldsForTrigger('review_expense_created').map((f) => f.field)).toContain(
      'rawType',
    );
    expect(fieldsForTrigger('record_created').map((f) => f.field)).toContain(
      'recurrence',
    );
    expect(actionTypesForTrigger('record_created')).not.toContain('ignore');
  });

  it('offers enrich actions only on the review event', () => {
    const review = actionTypesForTrigger('review_expense_created');
    expect(review).toEqual(
      expect.arrayContaining(['set_tags', 'set_name', 'set_notes', 'set_url']),
    );
    for (const t of ['set_tags', 'set_name', 'set_notes', 'set_url'] as const) {
      expect(actionTypesForTrigger('record_created')).not.toContain(t);
      expect(isTerminalAction(t)).toBe(false);
    }
  });

  it('offers set_account / set_method on both events', () => {
    for (const t of ['set_account', 'set_method'] as const) {
      expect(actionTypesForTrigger('review_expense_created')).toContain(t);
      expect(actionTypesForTrigger('record_created')).toContain(t);
      expect(isTerminalAction(t)).toBe(false);
    }
  });

  it('maps operators by kind and flags terminal actions', () => {
    expect(operatorsForKind('number')).toContain('between');
    expect(operatorsForKind('enum')).toEqual(['is', 'is_not']);
    expect(isTerminalAction('ignore')).toBe(true);
    expect(isTerminalAction('notify')).toBe(false);
  });
});

describe('applyTemplate', () => {
  const vars = { title: 'Pret A Manger', amount: '4.35', bank: null };

  it('substitutes known tokens, case-insensitively', () => {
    expect(applyTemplate('Coffee | <title>', vars)).toBe(
      'Coffee | Pret A Manger',
    );
    expect(applyTemplate('<TITLE> — <amount>', vars)).toBe(
      'Pret A Manger — 4.35',
    );
  });

  it('renders null/undefined as empty and leaves unknown tokens intact', () => {
    expect(applyTemplate('at <bank>!', vars)).toBe('at !');
    expect(applyTemplate('<nope> stays', vars)).toBe('<nope> stays');
  });

  it('exposes trigger-specific token lists', () => {
    expect(templateVars('review_expense_created').map((v) => v.token)).toContain(
      'title',
    );
    expect(templateVars('record_created').map((v) => v.token)).toContain(
      'method',
    );
  });
});

describe('formatSyncSummary', () => {
  it('lists every non-zero clause and always the review clause', () => {
    expect(
      formatSyncSummary({
        pulled: 10,
        paymentsCreated: 2,
        expensesCreated: 4,
        autoIgnored: 0,
        needsReview: 4,
      }),
    ).toBe(
      '10 transactions pulled, 2 payments automatically created, 4 expenses automatically created, 4 need your review',
    );
  });

  it('drops zero-count clauses and singularises', () => {
    expect(
      formatSyncSummary({
        pulled: 1,
        paymentsCreated: 0,
        expensesCreated: 0,
        autoIgnored: 0,
        needsReview: 1,
      }),
    ).toBe('1 transaction pulled, 1 needs your review');
  });

  it('mentions auto-ignored when present', () => {
    expect(
      formatSyncSummary({
        pulled: 5,
        paymentsCreated: 0,
        expensesCreated: 1,
        autoIgnored: 3,
        needsReview: 1,
      }),
    ).toBe(
      '5 transactions pulled, 1 expense automatically created, 3 auto-ignored, 1 needs your review',
    );
  });
});
