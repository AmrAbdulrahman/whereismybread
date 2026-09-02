# Tech debt & follow-ups

Known shortcuts, deliberately taken. Each is fine for now; revisit before the
noted trigger.

## Auth

- **Rate limiting is in-memory** (`libs/auth/src/lib/rate-limit.ts`) — per
  serverless instance, so the real ceiling is `limit × instance count`.
  Accepted for now. _Trigger to fix:_ before opening signup to the public, or
  the first abuse. Swap the `Map` for Vercel KV / Upstash — the call sites in
  `actions.ts` don't change.

- **Transactional email uses the Resend sandbox sender**
  (`onboarding@resend.dev`), which only delivers to the Resend account owner.
  Password-reset and verification links are logged to the server console in
  development as a fallback. _Trigger to fix:_ before any non-owner needs to
  receive mail (preview testers, production). Verify a sending domain in Resend
  (SPF + DKIM), set a real `RESEND_API_KEY` / `EMAIL_FROM` per Vercel
  environment.

- **Password change does not invalidate other sessions.** The current device is
  unaffected; other devices keep their JWT until it expires (30 days). Accepted.
  The `users.password_changed_at` column already exists if we later want to
  reject older tokens in the `jwt` callback.

## Data

- **No Row-Level Security yet.** Every repository function in `libs/db` requires
  a `userId` and filters by it, and all DB access is server-only behind that
  layer — so isolation holds today. RLS (enable + `user_id = current_setting`
  policies + a per-request `SET LOCAL app.user_id` transaction wrapper) is the
  defense-in-depth the plan calls for, deferred to keep Phase 2 shippable.
  _Trigger to fix:_ before multi-tenant data volume grows, or the first
  raw-SQL / admin path that bypasses the repositories.

## Deploy

- **Migrations and the Vercel deploy race.** Vercel auto-deploys on push to
  `main` via the git integration; the CI `migrate` job runs in parallel, not
  before. For additive migrations this is harmless; for a breaking schema
  change, run `pnpm db:migrate` manually against production first, or pause the
  Vercel deploy. _Trigger to fix:_ the first destructive migration.

## Local dev

- `apps/web/.env.local` is a git-ignored symlink to the repo-root `.env.local`,
  recreated by `pnpm setup`. Needed only when running `next` directly (e.g. the
  Playwright web server); `pnpm dev` via Nx loads the root file on its own.
