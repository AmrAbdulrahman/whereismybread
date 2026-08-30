import {
  addMoney,
  formatMoney,
  money,
  parseMoneyInput,
  sumMoney,
} from './money';

describe('money', () => {
  it('adds amounts of the same currency', () => {
    expect(addMoney(money(1099, 'EUR'), money(1, 'EUR'))).toEqual(
      money(1100, 'EUR'),
    );
  });

  it('refuses to mix currencies', () => {
    expect(() => addMoney(money(100, 'EUR'), money(100, 'USD'))).toThrow();
  });

  it('parses user input into minor units', () => {
    expect(parseMoneyInput('€1,450.00', 'EUR')).toEqual(money(145000, 'EUR'));
    expect(parseMoneyInput('12', 'EUR')).toEqual(money(1200, 'EUR'));
  });

  it('sums an empty list to zero', () => {
    expect(sumMoney([], 'EUR')).toEqual(money(0, 'EUR'));
  });

  it('formats with a currency symbol', () => {
    expect(formatMoney(money(145000, 'EUR'))).toMatch(/1,450\.00/);
  });
});
