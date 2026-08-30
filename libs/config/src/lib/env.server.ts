import { z } from 'zod';

/**
 * Server-only environment. Importing this module from client code will throw.
 * Values are validated once, lazily, on first access.
 *
 * On Vercel the DB/KV/Blob variables are injected by their marketplace
 * integrations; `AUTH_SECRET`, `RESEND_API_KEY` and `EMAIL_FROM` are set
 * manually per environment. Locally they come from `.env.local`.
 */
const serverSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  // Database — Supabase Postgres
  POSTGRES_URL: z.url(),
  POSTGRES_URL_NON_POOLING: z.url().optional(),

  // Auth.js
  AUTH_SECRET: z.string().min(1),
  AUTH_URL: z.url().optional(),

  // Absolute base URL, for links in transactional emails.
  APP_URL: z.url().default('http://localhost:3000'),

  // Transactional email — Resend
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z
    .string()
    .min(1)
    .default('Where Is My Bread <onboarding@resend.dev>'),

  // Rate limiting — Vercel KV (optional until Phase 1)
  KV_REST_API_URL: z.url().optional(),
  KV_REST_API_TOKEN: z.string().optional(),

  // File storage — Vercel Blob (optional until Phase 6)
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

const skipValidation =
  process.env['SKIP_ENV_VALIDATION'] === '1' ||
  process.env['SKIP_ENV_VALIDATION'] === 'true';

let cached: ServerEnv | undefined;

function load(): ServerEnv {
  const inBrowser =
    typeof (globalThis as Record<string, unknown>)['window'] !== 'undefined';
  if (inBrowser) {
    throw new Error(
      '`serverEnv()` was called in the browser. Use `clientEnv` for anything that runs client-side.',
    );
  }

  if (skipValidation) {
    return process.env as unknown as ServerEnv;
  }

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map(
        (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n');
    throw new Error(`Invalid server environment variables:\n${details}`);
  }
  return parsed.data;
}

export function serverEnv(): ServerEnv {
  cached ??= load();
  return cached;
}
