/**
 * The auto-ignore rules configured per bank connection. One rule per line:
 *   - a blank line or a line starting with `#` is skipped
 *   - every other line is a case-insensitive regular expression; if it
 *     doesn't compile it's treated as a literal substring
 * A synced transaction is auto-ignored when any rule matches its description
 * or its raw type.
 */

/**
 * The rules a fresh connection starts with — also serves as the example.
 *
 * Kept deliberately narrow: this is a bill tracker, so direct debits,
 * standing orders and card payments are exactly what the user wants to
 * triage. The only default is Wise's per-purchase fee line, which is pure
 * noise. Users can add their own rules per connection.
 */
export const DEFAULT_IGNORE_PATTERNS = `# One rule per line — case-insensitive regex, matched against the
# transaction description and type. Lines starting with # are comments.
# Matching transactions are imported already marked "ignored".
#
# Example — ignore every direct debit:
# DIRECT[_ ]?DEBIT
#
# Wise adds a tiny fee line per card purchase — usually just noise:
Wise Charges for
`;

export interface IgnoreMatcher {
  source: string;
  test: (s: string) => boolean;
}

export function parseIgnorePatterns(text: string | null): IgnoreMatcher[] {
  if (!text) return [];
  const out: IgnoreMatcher[] = [];
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) continue;
    try {
      const re = new RegExp(raw, 'i');
      out.push({ source: raw, test: (s) => re.test(s) });
    } catch {
      const needle = raw.toLowerCase();
      out.push({ source: raw, test: (s) => s.toLowerCase().includes(needle) });
    }
  }
  return out;
}

/** True when any rule matches the description or the raw type. */
export function shouldIgnore(
  matchers: IgnoreMatcher[],
  description: string,
  rawType: string | null,
): boolean {
  if (matchers.length === 0) return false;
  const haystacks = [description, rawType ?? ''];
  return matchers.some((m) => haystacks.some((h) => m.test(h)));
}
