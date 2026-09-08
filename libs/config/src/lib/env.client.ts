/**
 * Client-safe environment. Only `NEXT_PUBLIC_*` values, so it is safe to import
 * from anywhere. Next.js inlines these at build time.
 */
export const clientEnv = {
  /**
   * Identity of the deployment this bundle was built from. Set automatically
   * on Vercel (`VERCEL_GIT_COMMIT_SHA` -> `VERCEL_DEPLOYMENT_ID` fallback) by
   * `apps/web/next.config.js`; `"dev"` when running locally.
   */
  BUILD_ID: process.env['NEXT_PUBLIC_BUILD_ID'] ?? 'dev',

  /**
   * VAPID public key for `pushManager.subscribe`. Empty string when push is
   * not configured for the deployment — the settings UI treats that as
   * "push unavailable".
   */
  VAPID_PUBLIC_KEY: process.env['NEXT_PUBLIC_VAPID_PUBLIC_KEY'] ?? '',
} as const;

export type ClientEnv = typeof clientEnv;
