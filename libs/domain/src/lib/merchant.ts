/**
 * Best-effort "what shop/service was this?" extraction from a raw bank
 * transaction description. Pure and heuristic — tuned for Wise / UK bank
 * wording. Always returns *something*; falls back to a tidied version of the
 * original when it can't do better. The full original stays available for
 * the notes field.
 */

/** Leading id tokens Wise/banks prepend, e.g. "CARD-4189747384 ". */
const LEAD_ID =
  /^((fee-)?card|transfer|p2p|dd|direct_debit|balance|topup|refund|payment)-\d+\s+/i;

/** Leading verb phrases banks prepend — stripped wholesale. */
const LEAD = new RegExp(
  '^(' +
    [
      'card (payment|purchase|transaction)( of -?[\\d.,]+ ?[a-z]{3})?( issued by| to| at)?',
      'direct debit( payment)?( to)?',
      'standing order( to)?',
      'bill payment( to)?',
      'faster payments?( (to|from))?',
      'bank (transfer|giro credit)( (to|from))?',
      '(online |mobile )?payment (to|from)',
      'transfer (to|from)',
      'sent money to',
      'received( [\\d.,]+ ?[a-z]{3})? (money )?from',
      'received money from',
      'withdrawal( at)?',
      'pos( purchase)?',
      'contactless( payment)?',
      'vdp|vdc|visa|mastercard|maestro',
      'to|from',
    ].join('|') +
    ')\\s+',
  'i',
);

/** Trailing noise: fees, refs, dates, city + country, bare currency/amount. */
const TRAIL = [
  /\s*\(fee:[^)]*\)\s*$/i, // Wise "(fee: 0.06 GBP)"
  /\s+with reference\b.*$/i, // "… with reference PIXELSQUARE"
  /[,;\s]+\b(ref(erence)?|mandate)\b[:.]?\s*\S+.*$/i, // "… ref: 12345"
  /\s+\d{2}[/-]\d{2}[/-]\d{2,4}.*$/, // a trailing date
  /\s+\d{3,}.*$/, // a run of 3+ digits and everything after
  /\s+\S*\.\w{2,3}(\.\w{2,3})?(\/\S*)?$/i, // a trailing domain/url ("amzn.uk/bill")
  /\s+-?\d{1,3}[A-Z]\b.*$/, // Wise POS location codes ("… -07C", "… -28D")
  /\s+[\d.,]+\s*[a-z]{3}\s*$/i, // trailing "12.00 GBP"
  /\s+[A-Z]\.?\s*$/, // a dangling single capital ("... E.", "... Z")
  /\s+[a-z]{2}\s*$/i, // trailing country code
  /\s{2,}.*$/, // anything after a big whitespace gap
];

/**
 * Drop trailing ALL-CAPS words that look like a city/region, but never so
 * many that fewer than two words are left (so "TESCO STORES", "COFFEE BAR",
 * "ACME LTD" survive intact while "… NASSER CITY" / "… CAIRO" go).
 */
function stripTrailingLocation(s: string): string {
  const toks = s.split(' ');
  while (toks.length > 2 && /^[A-Z][A-Z&.'-]+$/.test(toks.at(-1) ?? '')) {
    toks.pop();
  }
  return toks.join(' ');
}

function titleCaseIfShouting(s: string): string {
  const letters = s.replace(/[^a-z]/gi, '');
  if (!letters) return s;
  const upper = letters === letters.toUpperCase();
  const lower = letters === letters.toLowerCase();
  if (!upper && !lower) return s; // already mixed-case — leave it
  return s.replace(
    /\p{L}[\p{L}'’]*/gu,
    (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
  );
}

export function cleanMerchant(
  description: string,
  rawType?: string | null,
): string {
  let s = (description ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return rawType ? titleCaseIfShouting(rawType.replace(/_/g, ' ')) : '';

  const before = s;
  s = s.replace(LEAD_ID, '');
  s = s.replace(LEAD, '');

  // Trailing noise first, so a trailing "(fee: …)" doesn't block the
  // aggregator split below.
  for (const re of TRAIL) s = s.replace(re, '').trim();

  // "Fawry*Aswaq Aljmlh" / "SQ *COFFEE BAR" → keep the wordier half.
  if (s.includes('*')) {
    const parts = s.split('*').map((p) => p.trim());
    s =
      parts.sort(
        (a, b) =>
          b.replace(/[^a-z]/gi, '').length - a.replace(/[^a-z]/gi, '').length,
      )[0] ?? s;
    for (const re of TRAIL) s = s.replace(re, '').trim();
  }

  s = stripTrailingLocation(s);
  for (const re of TRAIL) s = s.replace(re, '').trim();

  // trailing store/branch number: "TESCO STORES 2913" → "TESCO STORES"
  s = s.replace(/\s+\d{1,5}$/, '').trim();
  s = s.replace(/[\s,;:*/-]+$/, '').replace(/^[\s,;:*/-]+/, '').trim();

  if (s.length < 2) s = before.replace(/\s+/g, ' ').trim();

  return titleCaseIfShouting(s);
}
