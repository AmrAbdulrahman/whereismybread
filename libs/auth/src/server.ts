// Node-only auth surface: DB lookups, argon2, the NextAuth handlers. Import
// this from route handlers, server components and server-only modules — never
// from a client component.

export { handlers, auth, signIn, signOut } from './lib/auth';
export { getCurrentUser, requireUser, requireUserId } from './lib/session';
export type { SessionUser } from './lib/types';
