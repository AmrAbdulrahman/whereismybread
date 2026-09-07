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

  it('matches the default DIRECT_DEBIT rule on the raw type', () => {
    expect(shouldIgnore(m, 'Netflix', 'DIRECT_DEBIT')).toBe(true);
    expect(shouldIgnore(m, 'direct debit to gym', null)).toBe(true);
  });

  it("doesn't match unrelated transactions", () => {
    expect(shouldIgnore(m, 'Tesco', 'CARD_PAYMENT')).toBe(false);
  });

  it('is false when there are no matchers', () => {
    expect(shouldIgnore([], 'anything', 'DIRECT_DEBIT')).toBe(false);
  });
});
