// Edge-safe: only the shared config (no DB, no argon2). Used by middleware.
import NextAuth, { type NextAuthResult } from 'next-auth';
import { authConfig } from './lib/auth.config';

const result: NextAuthResult = NextAuth(authConfig);

export const auth: NextAuthResult['auth'] = result.auth;
export { authConfig };
