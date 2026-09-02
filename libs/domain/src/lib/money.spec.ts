import {
  addMoney,
  convertMoney,
  formatConverted,
  formatMoney,
  money,
  parseMoneyInput,
  sumMoney,
  toMajor,
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

  it('parses user input into the currency’s minor units', () => {
    expect(parseMoneyInput('€1,450.00', 'EUR')).toEqual(money(145000, 'EUR'));
    expect(parseMoneyInput('12', 'EUR')).toEqual(money(1200, 'EUR'));
    // JPY has no minor units
    expect(parseMoneyInput('6000', 'JPY')).toEqual(money(6000, 'JPY'));
    // BHD has 3
    expect(parseMoneyInput('1.5', 'BHD')).toEqual(money(1500, 'BHD'));
  });

  it('sums an empty list to zero', () => {
    expect(sumMoney([], 'EUR')).toEqual(money(0, 'EUR'));
  });

  it('formats with per-currency decimals', () => {
    expect(formatMoney(money(145000, 'EUR'))).toMatch(/1,450\.00/);
    expect(formatMoney(money(6000, 'JPY'))).not.toMatch(/\./);
  });

  it('converts between currencies via a rate map', () => {
    const rates = { EUR: 1, GBP: 0.85, EGP: 52 };
    // 6000 EGP -> GBP: 6000/52 * 0.85
    const gbp = convertMoney(money(600000, 'EGP'), 'GBP', rates);
    expect(gbp.currency).toBe('GBP');
    expect(toMajor(gbp)).toBeCloseTo((6000 / 52) * 0.85, 1);
  });

  it('formatConverted shows converted then original in brackets', () => {
    const rates = { GBP: 1, EGP: 60 };
    const out = formatConverted(money(600000, 'EGP'), 'GBP', rates);
    expect(out).toMatch(/£100\.00 \(6,000\.00 EGP\)/);
  });

  it('formatConverted is plain when currency matches or no rate', () => {
    expect(formatConverted(money(10000, 'GBP'), 'GBP', {})).toMatch(/£100\.00/);
    expect(formatConverted(money(10000, 'GBP'), 'EGP', {})).toMatch(/£100\.00/);
  });
});
