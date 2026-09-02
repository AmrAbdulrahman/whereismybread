export interface CurrencyMeta {
  code: string;
  name: string;
  symbol: string;
  /** Minor-unit exponent (2 for most, 0 for JPY, 3 for BHD…). */
  decimals: number;
}

/** Popular / widely-held currencies. Not exhaustive — enough to pick from. */
export const CURRENCIES: readonly CurrencyMeta[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', decimals: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimals: 2 },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2 },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimals: 2 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', decimals: 2 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2 },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', decimals: 2 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', decimals: 2 },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', decimals: 2 },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', decimals: 2 },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', decimals: 2 },
  { code: 'PLN', name: 'Polish Złoty', symbol: 'zł', decimals: 2 },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', decimals: 2 },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft', decimals: 2 },
  { code: 'RON', name: 'Romanian Leu', symbol: 'lei', decimals: 2 },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', decimals: 2 },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽', decimals: 2 },
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴', decimals: 2 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimals: 2 },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimals: 2 },
  { code: 'QAR', name: 'Qatari Riyal', symbol: '﷼', decimals: 2 },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك', decimals: 3 },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: '.د.ب', decimals: 3 },
  { code: 'OMR', name: 'Omani Rial', symbol: '﷼', decimals: 3 },
  { code: 'JOD', name: 'Jordanian Dinar', symbol: 'د.ا', decimals: 3 },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '₪', decimals: 2 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimals: 2 },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', decimals: 2 },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', decimals: 2 },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵', decimals: 2 },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'د.م.', decimals: 2 },
  { code: 'TND', name: 'Tunisian Dinar', symbol: 'د.ت', decimals: 3 },
  { code: 'DZD', name: 'Algerian Dinar', symbol: 'د.ج', decimals: 2 },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimals: 2 },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$', decimals: 2 },
  { code: 'ARS', name: 'Argentine Peso', symbol: '$', decimals: 2 },
  { code: 'CLP', name: 'Chilean Peso', symbol: '$', decimals: 0 },
  { code: 'COP', name: 'Colombian Peso', symbol: '$', decimals: 2 },
  { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/', decimals: 2 },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', decimals: 0 },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimals: 2 },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', decimals: 2 },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', decimals: 2 },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimals: 2 },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimals: 0 },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', decimals: 2 },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', decimals: 2 },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs', decimals: 2 },
  { code: 'ISK', name: 'Icelandic Króna', symbol: 'kr', decimals: 0 },
  { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв', decimals: 2 },
  { code: 'HRK', name: 'Croatian Kuna', symbol: 'kn', decimals: 2 },
  { code: 'RSD', name: 'Serbian Dinar', symbol: 'дин', decimals: 2 },
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', decimals: 2 },
];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);
const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function currencyMeta(code: string): CurrencyMeta {
  return (
    BY_CODE.get(code.toUpperCase()) ?? {
      code,
      name: code,
      symbol: code,
      decimals: 2,
    }
  );
}

export function isKnownCurrency(code: string): boolean {
  return BY_CODE.has(code.toUpperCase());
}
