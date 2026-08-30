import { hash, verify } from '@node-rs/argon2';
import { createHash } from 'node:crypto';

// OWASP-recommended argon2id parameters (~19 MiB, 2 passes).
const ARGON_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON_OPTIONS);
}

export async function verifyPassword(
  hashed: string,
  plain: string,
): Promise<boolean> {
  try {
    return await verify(hashed, plain, ARGON_OPTIONS);
  } catch {
    return false;
  }
}

/**
 * Have I Been Pwned range check (k-anonymity — only a 5-char SHA-1 prefix
 * leaves the server). Fails open: if the API is unreachable we don't block
 * signup.
 */
export async function isPasswordPwned(plain: string): Promise<boolean> {
  try {
    const sha1 = createHash('sha1').update(plain).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body
      .split('\n')
      .some((line) => line.split(':')[0]?.trim().toUpperCase() === suffix);
  } catch {
    return false;
  }
}
