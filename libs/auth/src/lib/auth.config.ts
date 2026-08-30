import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe half of the Auth.js config: no DB, no argon2. Used directly by
 * middleware; `auth.ts` spreads it and adds the Credentials provider (Node).
 */
export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: '/login' },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token['id'] = user.id;
        token['name'] = user.name ?? null;
      }
      return token;
    },
    session({ session, token }) {
      const id = token['id'];
      if (typeof id === 'string') session.user.id = id;
      const name = token['name'];
      session.user.name = typeof name === 'string' ? name : null;
      return session;
    },
  },
};
