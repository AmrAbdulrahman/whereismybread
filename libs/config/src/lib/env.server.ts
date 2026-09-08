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

  // Bank sync — Enable Banking (Open Banking AISP). All optional so deploys
  // without bank sync configured don't fail validation.
  //  - APP_ID       the application id, used as the JWT `kid`
  //  - PRIVATE_KEY  the RSA private key (PEM), base64-encoded to survive
  //                 single-line env vars; PEM-with-newlines is also accepted
  //  - API_URL      https://api.enablebanking.com (production / restricted prod)
  ENABLE_BANKING_APP_ID: z.string().optional(),
  ENABLE_BANKING_PRIVATE_KEY: z.string().optional(),
  ENABLE_BANKING_API_URL: z.url().default('https://api.enablebanking.com'),

  // AES-256-GCM key (base64, 32 bytes) for encrypting third-party tokens at
  // rest — currently the Enable Banking session id.
  SECRETS_ENCRYPTION_KEY: z.string().optional(),

  // Shared secret for manually triggering the bank-sync endpoint
  // (GET /api/bank-sync/enable-banking with `Authorization: Bearer <secret>`),
  // and the fallback GitHub Actions workflow (.github/workflows/bank-sync.yml).
  CRON_SECRET: z.string().optional(),

  // QStash (Upstash) — drives the periodic bank sync via a cron schedule that
  // POSTs the bank-sync endpoint. Requests are authenticated by verifying the
  // `Upstash-Signature` JWT against these signing keys (rotated pair). All
  // optional so deploys without QStash configured still validate.
  //  - QSTASH_TOKEN                publishing token, only needed to create/
  //                               manage schedules (see scripts/qstash-schedule.mjs)
  //  - QSTASH_URL                  QStash API base, defaults to the public host
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_URL: z.url().default('https://qstash.upstash.io'),

  // Web Push (VAPID). Generate a pair with `npx web-push generate-vapid-keys`.
  // The public key is also exposed to the browser as
  // `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (see env.client). All optional so deploys
  // without push configured still validate — push is simply skipped.
  //  - VAPID_SUBJECT  a `mailto:` or https URL identifying the sender
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:support@whereismybread.app'),
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
