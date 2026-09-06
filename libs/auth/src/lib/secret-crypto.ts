import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { serverEnv } from '@wib/config';

/**
 * Reversible at-rest encryption for third-party secrets we must store and
 * replay later (currently the Enable Banking session id, which is a bearer
 * credential to a user's account data).
 *
 * AES-256-GCM. The key is `SECRETS_ENCRYPTION_KEY` — base64, exactly 32
 * bytes. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Wire format (all base64, dot-separated): `iv.authTag.ciphertext`.
 */

const IV_BYTES = 12;

function key(): Buffer {
  const raw = serverEnv().SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'SECRETS_ENCRYPTION_KEY is not set — cannot encrypt/decrypt secrets.',
    );
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(
      `SECRETS_ENCRYPTION_KEY must decode to 32 bytes, got ${buf.length}.`,
    );
  }
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    enc.toString('base64'),
  ].join('.');
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('decryptSecret: malformed payload');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
