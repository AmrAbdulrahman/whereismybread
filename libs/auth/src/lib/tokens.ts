import { createHash, randomBytes } from 'node:crypto';

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** A URL-safe secret and its SHA-256 (only the hash is stored). */
export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function expiryFromNow(ttlMs: number): Date {
  return new Date(Date.now() + ttlMs);
}
