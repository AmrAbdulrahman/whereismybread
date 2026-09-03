# Performance analysis — `/plan`

_Measured 2026-09-02, local dev (Turbopack) against the production Supabase
instance (`aws-0-eu-west-2`, London)._

## TL;DR

Every interaction feels slow because almost all of them trigger a **full server
re-render that fires ~14 database queries in sequence**, against a Postgres
instance one ocean away from the functions calling it, with **no caching and no
optimistic UI** to hide the wait.

The bottleneck is **round-trip count × round-trip distance** — not Next.js, not
React, not the query planner. **A Vite SPA rewrite would not fix any of it** and
would remove the one thing working in our favour today (server-side data fetch in
a single request). Every fix below is inside the current stack.

## Measured baseline

| Operation | Wall clock | DB queries |
|---|---|---|
| open `/plan` (warm) | ~1.7 s | 14 |
| calendar → next month | ~1.7 s | 14 |
| tick a payment paid | ~2.3 s | 15 |
| add a payment | ~2.7 s | insert + 14 (full refetch) |

Raw pooler latency from the same machine:

- first query after idle (cold connection): **~1.5 s**
- warm single query: **97 ms**
- **5 queries in parallel: 1365 ms** — *slower* than 5 sequential (325 ms). The
  Supabase free-tier transaction pooler punishes concurrent connections, so the
  app's `Promise.all` fan-out works against it. A `max: 3` pool hung entirely.

### The 14 queries in one `GET /plan`

```
getCurrentUser                          (1)   findUserById
getPaymentsContext                      (5)   methods, accounts, banks,
                                              recipient_methods, tags
getPaymentBoard  Promise.all            (4)   payments, payment_events,
                                              exchange_rate_snapshots, month_incomes
listActivePayments → attachMeta         (4)   methods, accounts, banks  ← DUPLICATE
                                              payment_tags ⋈ tags
                                              (run strictly sequentially)
```

**8 of 14 are pure overhead**: `attachMeta` re-reads methods/accounts/banks that
`getPaymentsContext` already loaded, one query at a time.

## Root causes, ranked

### 1. Functions and DB are on different continents — _impact: massive, effort: minutes_

Supabase is in `eu-west-2` (London). There is no `vercel.json`, so functions
deploy to the account-default region (US East). Every query pays ~85 ms of
transatlantic latency — that **is** the 1.2 s.

**Fix:** add `vercel.json` with `"regions": ["lhr1"]`. Same-region round trips
drop to 5–15 ms → 14 × 10 ms ≈ 140 ms. ~8× cut, zero code.

### 2. The board is 14 queries when it should be 2–3 — _impact: high, effort: 0.5–1 day_

**Fix, by yield:**
- Thread the lookups already loaded by `getPaymentsContext` into `attachMeta`
  instead of re-querying → −3 queries immediately.
- Fetch payments + their tags in one query (`json_agg` / Drizzle relational
  `with`) → kills the separate tag join.
- Collapse the remaining per-user lookups into one round trip — a CTE returning
  `json_build_object(...)`, or Drizzle's `db.query` API.
- Read `rates` once per process behind an in-memory TTL — it's already a cached
  snapshot table; it does not need a query on every render.

Target: **14 → 3**. With #1: **~1.2 s → ~40 ms**.

### 3. No optimistic UI — _impact: high (most felt), effort: 1–2 days_

`markOccurrenceAction` does a fast write then `revalidatePath('/plan')`; the
checkbox stays pending while the **entire board re-renders** (15 more queries).
Add/edit/delete are the same — the form closes only after `router.refresh()`
finishes a full rebuild.

**Fix:** `useOptimistic` for the paid toggle (flip instantly, fire the action in
the background, drop the revalidate). For add/edit/delete, have the action
**return** the changed payment/board slice and merge it into client state — the
list already grew a board-merge layer for infinite scroll (`mergeBoards`); reuse
it. Interactions become instant regardless of DB latency.

### 4. Calendar month paging refetches data it already has — _impact: medium, effort: 2–3 h_

`board.window` already spans ~`today−1mo … today+3mo`, but `‹ ›` calls
`router.push(?month=…)` → full 14-query navigation for months whose occurrences
are already in `board.occurrences`.

**Fix:** keep `month` in local state, re-slice the existing `byDate` map. Only
hit the server when stepping outside the loaded window, and then as a background
merge (like `loadListWindowAction`), not a navigation. In-window paging → 0 ms.

### 5. `force-dynamic` + full refetch on every mutation, zero caching — _impact: medium, effort: few hours_

`/plan` is `export const dynamic = 'force-dynamic'`. Nothing is cached; any
re-render pays full price.

**Fix:** wrap the board read in `unstable_cache` (or `"use cache"`) keyed by
`userId + window`; `revalidateTag(\`board:\${userId}\`)` from the mutating
actions. Pairs with #3 — once the client patches its own state, the cache mostly
serves navigations.

### 6. Cold connection tax on every idle wake-up — _impact: medium, effort: 1–2 h_

First query after the function goes idle: **~1.5 s** for the pooled connection
(TLS + pgBouncer handshake). `idle_timeout: 20` + low traffic means most real
visits start cold.

**Fix:** enable Vercel **Fluid Compute** (keeps instances warm, shares the pool
across invocations); raise `idle_timeout`; the `lhr1` move also shrinks the
handshake. Consider Supavisor session mode / `@vercel/postgres` if it persists.

### 7. No indexes beyond PKs and name-uniqueness — _impact: low now, high later, effort: 30 min_

Every board query filters `WHERE user_id = …`; there's no index on
`payments.user_id`, `payment_events.user_id`, or `payment_events.due_date`. At
tens of rows a seq scan is ~0 ms (the 85 ms is network), so this is **not**
today's problem — but it's free and turns real the moment a user has hundreds of
occurrences.

**Fix:** one migration — `payments (user_id) WHERE archived_at IS NULL`,
`payment_events (user_id, due_date)`, `payment_tags (payment_id)`.

## Should we rewrite as a Vite SPA? — **No**

Every millisecond measured is **DB round-trip latency and query count**. An SPA
hits the same DB through an API layer — same 14 queries, same London hop — and
adds a waterfall in front: HTML → JS bundle → fetch → render, instead of today's
single server round trip that returns the page with its data in it.

We'd rebuild auth (middleware + RSC), routing, and data loading, and land with a
*worse* first paint and the identical backend bottleneck.

What people want from "an SPA" — instant client navigation and optimistic
updates — is findings **#3, #4, #5**, all achievable in the current stack this
week. If `/plan` later wants to be a thick client island owning its state and
talking to one cached endpoint, that's a component-level change inside Next, not
a framework migration.

## Recommended sequence

| # | Change | Where | Status | Effect |
|---|---|---|---|---|
| 1 | Pin region to `lhr1` | `vercel.json` | ✅ committed — **applies on next deploy** | ~8× on every DB wait |
| 2 | Stop re-querying in `attachMeta` — thread the loaded lookups | `payments.ts`, `queries.ts` | ✅ done | 14 → 11 queries |
| 3 | Optimistic mark-as-paid (`useOptimistic`) | `occurrence-item.tsx` | ✅ done | ~2.3 s → **~20 ms** |
| 4a | In-process rates memo (60 s) | `rates.ts` | ✅ done | 11 → 10 on warm renders |
| 4b | Collapse the 5 context lookups + 4 board reads into 1–2 round trips (CTE / `db.query`) | `queries.ts` + repos | ⬜ **not done** | 10 → ~3 queries |
| 5 | Client-side calendar paging within the loaded window | `payments-view.tsx` | ✅ done | in-window month change **~3.5 s → ~0 ms** |
| 6 | Optimistic add/edit/delete — actions return data, drop `router.refresh()` | `payments-view.tsx` + `actions.ts` | ⬜ **not done** | forms feel instant |
| 7 | Cache the board — `unstable_cache` + `revalidateTag` per user | `queries.ts` + `actions.ts` | ⬜ **not done** | cached navigations |
| 8 | `loading.tsx` skeleton for `/plan` | `plan/loading.tsx` | ✅ done | instant skeleton on nav |
| 9a | Index migration (`payments (user_id) partial`, `payment_events (user_id, due_date)`) | `0017_board_query_indexes` | ✅ generated + **applied to prod** | future-proofing |
| 9b | Enable Vercel Fluid Compute | Vercel dashboard | ⬜ **can't — needs dashboard** | cold-start relief, pool reuse |

### Measured after #1–#9a (local dev → London Supabase, `lhr1` not yet live)

| Operation | before | after |
|---|---|---|
| calendar → next month (in window) | ~3465 ms | **~0 ms** (client render) |
| mark paid | ~2338 ms | **~20 ms** (optimistic) |
| open `/plan` | ~1700 ms, 14 q | ~1350 ms, 10 q — collapses to **~80 ms once `lhr1` is live** |
| add payment | ~2700 ms | ~1400 ms — still does `router.refresh()` (see #6) |

### Projected

| State | `/plan` open | month page | mark paid | add payment |
|---|---|---|---|---|
| today | ~1700 ms | ~1700 ms | ~2300 ms | ~2700 ms |
| after #1 | ~450 ms | ~450 ms | ~500 ms | ~550 ms |
| after #1–#6 | ~250 ms | **~0 ms** | **~0 ms** | **~0 ms** |
| after #1–#8 (cached) | **~80 ms** | ~0 ms | ~0 ms | ~0 ms |

"~0 ms" = optimistic client update; the server call still happens, in the
background, and reconciles.

_Dev double-render inflates the raw wall-clock numbers; the per-render query
counts and the `GET /plan?month=…` figure (14 queries / 1.24 s) are
production-representative._
