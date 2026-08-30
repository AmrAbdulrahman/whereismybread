# Where Is My Bread

A mobile-first money-planning app — upcoming payments, subscriptions, installments,
a manual-transfer checklist, and debts — as a list, a calendar, or a year heatmap.

- **Design:** the approved "Command Deck" direction and full 7-phase build plan
  live in [`design/`](design/) (open the `.html` files in a browser).
- **Status:** Phase 1. Foundations plus self-owned authentication (sign up, sign
  in, password reset, email confirmation, profile). Feature screens are
  placeholders until their phase.

## Stack

| Area     | Choice                                                           |
| -------- | ---------------------------------------------------------------- |
| Monorepo | Nx + pnpm — one standalone `feature-<name>` lib per domain       |
| App      | Next.js 16, App Router, React 19, TypeScript strict              |
| Styling  | Tailwind CSS v4 + Radix primitives (owned in `libs/ui`)          |
| DB       | Supabase Postgres via Drizzle ORM (`libs/db`)                    |
| Auth     | Auth.js v5, Credentials, JWT — self-owned (`libs/auth`, Phase 1) |
| Email    | Resend (`onboarding@resend.dev` sandbox in dev)                  |
| Files    | Vercel Blob (Phase 6)                                            |
| Hosting  | Vercel                                                           |

## Prerequisites

- Node `>=22` (`.nvmrc` pins the CI version), pnpm `>=10` (`corepack enable`)

## First-time setup

```bash
pnpm install
cp .env.example .env.local   # then fill in the values below
```

### Provision cloud resources

All of these are created from the Vercel dashboard once the repo is imported as a
Vercel project:

1. **Supabase** — add the _Supabase_ integration from the Vercel Marketplace. It
   injects `POSTGRES_URL` (pooled, port 6543) and `POSTGRES_URL_NON_POOLING`
   (direct, 5432). Copy both into `.env.local` for local dev.
2. **Vercel KV** — create a KV store (Storage tab). Injects `KV_REST_API_URL` /
   `KV_REST_API_TOKEN`. Only needed from Phase 1 (auth rate limiting).
3. **Vercel Blob** — create a Blob store. Injects `BLOB_READ_WRITE_TOKEN`. Only
   needed from Phase 6.
4. **Auth secret** — `npx auth secret` (or `openssl rand -base64 33`) → `AUTH_SECRET`.
5. **Resend** — the dev sandbox key is already in `.env.local`. Before
   preview/production, verify a sending domain in Resend and set a real
   `RESEND_API_KEY` / `EMAIL_FROM` per Vercel environment.

### Database

```bash
pnpm db:migrate        # apply migrations (needs POSTGRES_URL_NON_POOLING)
pnpm db:generate       # after changing libs/db schema — creates a new migration
pnpm db:studio         # browse data
```

Migrations always use the **direct** connection, never the pooler.

## Everyday commands

```bash
pnpm dev               # start the app at http://localhost:3000
pnpm build             # production build
pnpm typecheck         # tsc across every project
pnpm lint              # eslint + module-boundary rules
pnpm test              # vitest across every project
pnpm e2e               # Playwright smoke tests (starts the app itself)
pnpm format            # prettier --write
```

Prefer `nx affected -t <target>` when iterating — it only runs what changed.

`AUTH_E2E=1 pnpm e2e` also runs the DB-backed auth flow (sign up → sign out →
sign in → reset). It's skipped by default so CI's e2e stays hermetic.

## Auth (`libs/auth`)

Auth.js v5, Credentials provider, JWT sessions — we own the `users` table and
password hashing (`argon2id`). Server actions live in `libs/auth`; the client
imports them from `@wib/auth`, server code from `@wib/auth/server`, and
`proxy.ts` (route guard) from `@wib/auth/edge`.

Forms use **react-hook-form + `zodResolver`** for client-side validation; the
server actions re-validate with the **same Zod schemas** (`libs/auth/schemas.ts`)
and never trust the client. Field errors round-trip back onto the form via
`setError` (`apps/web/src/app/_components/apply-server-errors.ts`).

- Screens: `/signup`, `/login`, `/forgot-password`, `/reset-password/[token]`,
  `/verify/[token]`, and `/account` (name, email, change password).
- Reset and verification tokens are single-use, hashed at rest, short-TTL.
- New passwords are checked against Have I Been Pwned (k-anonymity, fails open).
- Rate limiting is in-memory (`libs/auth/rate-limit.ts`) — **swap for Vercel KV /
  Upstash before production**; the call sites don't change.
- Emails go through Resend. The dev sandbox sender only delivers to the Resend
  account owner, so the reset/verify link is also logged to the server console
  in development.

Health checks once the DB is connected:

- `GET /api/health` — runs `select 1`, returns `{ status, db: { ok, latencyMs } }`
- `GET /api/version` — the deployment's build id (drives the update prompt)

## Workspace layout

```
apps/
  web/            Next.js app — routing, layouts, composition only
  web-e2e/        Playwright
libs/
  feature-*       one standalone lib per business domain (payments, debts, …)
  ui              design system: Radix + Tailwind primitives, tokens, AppShell
  domain          types, Zod schemas, money / date / recurrence helpers
  db              Drizzle schema + client + migrations
  auth            session helpers (Phase 1: Auth.js)
  config          Zod-validated env (server + client)
  updates         build-version check hook
  testing         render helpers, fetch stub
```

Import rules are enforced by `@nx/enforce-module-boundaries` in
`eslint.config.mjs`: a `feature-*` lib may use `ui` / `domain` / `db` / `auth` /
`config` but **never another feature lib** — features compose only in `apps/web`.

## Deploying

- **Preview:** every PR gets a Vercel preview deployment automatically.
- **Production:** on merge to `main`, CI runs the `migrate` job (direct
  connection) and then Vercel promotes the production alias. Add
  `POSTGRES_URL_NON_POOLING` as a repo secret in the `production` environment.
- Enable **Skew Protection** in the Vercel project so clients that haven't
  reloaded onto a new deployment keep hitting a matching backend.
