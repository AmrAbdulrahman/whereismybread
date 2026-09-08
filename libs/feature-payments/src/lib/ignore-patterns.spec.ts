import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IGNORE_PATTERNS,
  parseIgnorePatterns,
  shouldIgnore,
} from './ignore-patterns';

describe('parseIgnorePatterns', () => {
  it('skips blank lines and comments', () => {
    expect(parseIgnorePatterns('# hi\n\n  \nNETFLIX')).toHaveLength(1);
  });

  it('compiles regex lines and falls back to substring on bad regex', () => {
    const [re, literal] = parseIgnorePatterns('foo.*bar\n[unclosed');
    expect(re?.test('FOO baz BAR')).toBe(true);
    expect(literal?.test('an [unclosed thing')).toBe(true);
  });

  it('returns nothing for null / empty', () => {
    expect(parseIgnorePatterns(null)).toEqual([]);
    expect(parseIgnorePatterns('   ')).toEqual([]);
  });
});

describe('shouldIgnore', () => {
  const m = parseIgnorePatterns(DEFAULT_IGNORE_PATTERNS);

  it('matches the default Wise fee rule', () => {
    expect(
      shouldIgnore(m, 'Wise Charges for: CARD-123', 'CARD'),
    ).toBe(true);
  });

  it('leaves direct debits alone by default (this is a bill tracker)', () => {
    expect(shouldIgnore(m, 'Netflix', 'DIRECT_DEBIT')).toBe(false);
    expect(shouldIgnore(m, 'direct debit to gym', null)).toBe(false);
  });

  it("doesn't match unrelated transactions", () => {
    expect(shouldIgnore(m, 'Tesco', 'CARD_PAYMENT')).toBe(false);
  });

  it('is false when there are no matchers', () => {
    expect(shouldIgnore([], 'anything', 'DIRECT_DEBIT')).toBe(false);
  });
});
