import { describe, expect, it } from 'vitest';
import { cleanMerchant } from './merchant';

describe('cleanMerchant', () => {
  it('strips card-payment lead-ins', () => {
    expect(cleanMerchant('Card payment to TESCO STORES 2913')).toBe(
      'Tesco Stores',
    );
    expect(
      cleanMerchant('CARD PAYMENT OF 12.00 GBP ISSUED BY Pret A Manger'),
    ).toBe('Pret A Manger');
  });

  it('handles the real Wise card-transaction format', () => {
    expect(
      cleanMerchant(
        'CARD-4176945789 Card transaction of 50.00 EGP issued by Paymob-*Adel Pharmacy CAIRO (fee: 0.01 GBP)',
      ),
    ).toBe('Adel Pharmacy');
    expect(
      cleanMerchant(
        'CARD-4185217744 Card transaction of 67.00 EGP issued by Zaher Dairy Gardenia NASSER CITY (fee: 0.01 GBP)',
      ),
    ).toBe('Zaher Dairy Gardenia');
    expect(
      cleanMerchant(
        'CARD-4189747384 Card transaction of 397.00 EGP issued by Fawry*Aswaq Aljmlh Z CAIRO E (fee: 0.06 GBP)',
      ),
    ).toBe('Aswaq Aljmlh');
  });

  it('strips direct debit / standing order lead-ins', () => {
    expect(cleanMerchant('Direct Debit to Netflix')).toBe('Netflix');
    expect(cleanMerchant('STANDING ORDER TO LANDLORD')).toBe('Landlord');
  });

  it('handles Wise money-movement wording', () => {
    expect(cleanMerchant('Sent money to John Smith')).toBe('John Smith');
    expect(cleanMerchant('Received money from ACME LTD')).toBe('Acme Ltd');
  });

  it('keeps the human half of aggregator strings', () => {
    expect(cleanMerchant('SQ *COFFEE BAR')).toBe('Coffee Bar');
  });

  it('drops trailing city + country and refs', () => {
    expect(cleanMerchant('TESCO STORES 6148 LONDON GB')).toBe('Tesco Stores');
    expect(cleanMerchant('Spotify ref: 998877221')).toBe('Spotify');
  });

  it('leaves an already-clean name alone', () => {
    expect(cleanMerchant('Netflix')).toBe('Netflix');
    expect(cleanMerchant('Amazon Prime')).toBe('Amazon Prime');
  });

  it('falls back to the tidied original when it strips too much', () => {
    expect(cleanMerchant('   ')).toBe('');
    expect(cleanMerchant('to')).toBe('To');
  });

  it('uses the raw type when there is no description', () => {
    expect(cleanMerchant('', 'DIRECT_DEBIT')).toBe('Direct Debit');
  });
});
