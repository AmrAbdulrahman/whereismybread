import {
  RESET_TOKEN_TTL_MS,
  expiryFromNow,
  generateToken,
  hashToken,
} from './tokens';

describe('tokens', () => {
  it('generates a URL-safe token and a stable hash', () => {
    const { token, tokenHash } = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(tokenHash).toHaveLength(64);
    expect(hashToken(token)).toBe(tokenHash);
  });

  it('produces unique tokens', () => {
    const seen = new Set(
      Array.from({ length: 50 }, () => generateToken().token),
    );
    expect(seen.size).toBe(50);
  });

  it('computes an expiry in the future', () => {
    const expires = expiryFromNow(RESET_TOKEN_TTL_MS);
    expect(expires.getTime()).toBeGreaterThan(Date.now());
    expect(expires.getTime()).toBeLessThanOrEqual(
      Date.now() + RESET_TOKEN_TTL_MS,
    );
  });
});
