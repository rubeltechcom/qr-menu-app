# QR Menu & Ordering — Multi-Tenant SaaS

A multi-tenant platform for digital QR-code menus and contactless restaurant
ordering. See [PROMPT.md](./PROMPT.md) for the full product/architecture
brief this codebase implements.

## Stack

Next.js (App Router) · TypeScript (strict) · PostgreSQL + Prisma · Redis ·
Tailwind CSS · Auth.js · Stripe.

## Getting started

Requirements: Node.js 20 LTS, Docker Desktop.

```bash
# 1. Install dependencies
npm install

# 2. Start local Postgres + Redis
docker compose up -d

# 3. Copy env template and fill in any secrets you have
cp .env.example .env.local
# .env.local already has working defaults for local Postgres/Redis/auth

# 4. Apply the database schema
npm run db:migrate

# 5. Run the app
npm run dev
```

```bash
# 6. Optional: load a demo restaurant to click around
npm run db:seed:demo
```

Open http://localhost:3000. The demo seed prints its login
(`demo@qrmenu.test` / `demo1234`) and a scannable table URL.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm run db:migrate` | Create/apply a dev migration |
| `npm run db:deploy` | Apply migrations (CI/production) |
| `npm run db:studio` | Prisma Studio GUI |
| `npm run db:seed:demo` | Load demo restaurant, menu and tables (idempotent) |

## Project structure

```
src/
  app/            Next.js routes (marketing, storefront, admin, staff)
  modules/        Feature modules — service + repository + schema per feature
  server/
    db/           Prisma client + tenant-scoped client (see below)
    tenant-context.ts   Request-scoped tenant context (AsyncLocalStorage)
  components/ui/  Local wrapper layer over shadcn/ui primitives
  lib/            Cross-cutting utilities (env validation, etc.)
prisma/
  schema.prisma   Database schema
```

## Multi-tenancy

Tenant isolation is enforced at three independent layers — see PROMPT.md
§3.1 for the reasoning:

1. **Database** — Postgres Row-Level Security policies (added in Phase 1
   migrations) keyed on the `app.tenant_id` session setting.
2. **ORM** — feature code never imports `@prisma/client` directly (this is
   enforced by an ESLint rule). All data access goes through
   `forTenant(tenantId)` in `src/server/db/tenant-client.ts`, which
   auto-injects a tenant filter into every query.
3. **Request** — `src/proxy.ts` (Next.js 16's name for what used to be
   `middleware.ts`) resolves the tenant hostname before any handler runs;
   `src/server/tenant-context.ts` makes that tenant available via
   `requireTenantContext()`, which throws rather than silently returning
   an unscoped client.

   Note that `AsyncLocalStorage` does not survive React's render
   boundary, so a Server Component must take the scoped `db` out of the
   context and pass it to repositories explicitly — see the comment on
   `runWithTenant()`. `requireDashboardTenant()` returns `db` for exactly
   this reason.

A cross-tenant-read test suite (added alongside the Phase 1 schema) must
pass in CI before any tenant-scoped feature ships.

## Realtime ordering

Orders reach the kitchen over Server-Sent Events (`/api/realtime/orders`),
published through Redis pub/sub so every app instance delivers.

**Redis is treated as an optimisation, not a dependency.** If it is
unreachable the bus falls back to in-process delivery — correct on a
single instance, with a warning logged — because a kitchen that stops
hearing orders is the one failure this product cannot absorb.

The board defends the same failure three more ways:

1. `EventSource` reconnects on its own.
2. Every reconnect triggers a full re-sync against
   `/api/admin/orders` — the stream resumes silently and never says what
   it missed, so this is the layer that actually prevents a lost order.
3. A 30-second poll runs underneath, in case the stream is open but
   wedged.

The audible alert needs one click to arm it ("Click here to enable
sound"): browsers block `audio.play()` until a user gesture, so the
click plays a muted clip and rewinds it. The choice is remembered per
browser.

## Staff console

Waiters and kitchen staff sign in with a PIN rather than an email
(`/staff/login`), and get two tablet-first screens:

- **`/staff/kitchen`** — tickets oldest-first, colour-coded by how long
  they have been waiting (amber at 8 minutes, red at 15), one tap to
  start or mark ready.
- **`/staff/floor`** — every table on the floor with what it is waiting
  on; green means there is food to carry out.

Both use the same `useLiveOrders` hook as the owner's board, so the
delivery guarantees cannot drift apart between the two surfaces. They
authenticate differently, though, so they have their own endpoints
(`/api/staff/realtime`, `/api/staff/orders`) that check the PIN session
and take the tenant from it rather than from the query string.

## Payments

Two separate flows of money, in two separate modules, so a refund on
someone's dinner can never touch a subscription:

- **`src/modules/billing`** — the platform charging restaurants. Free /
  Smart / Pro, with entitlements defined as *data* in `plans.ts`;
  `can()`, `limitFor()` and `assertCanCreate()` are the only things that
  read them, so adding a plan never means touching feature code.
- **`src/modules/payments`** — diners paying restaurants, behind a
  `PaymentProvider` interface with Stripe and bKash implementations.
  Adding SSLCommerz or Razorpay means one new file plus a line in
  `registry.ts`.

**Prices are never taken from the request.** The cart posts item ids;
every amount, modifier delta and platform fee is re-read server-side.

**A redirect is not proof of payment.** Both the return page and the
webhook funnel into one idempotent `recordOutcome()`, and a terminal
state never moves again — so a late "expired" event cannot un-pay an
order the diner already settled.

**bKash differs from Stripe in two ways that shaped the interface:** it
has no webhooks (its `execute` call on return is what captures the
money, which is why the interface is redirect-first), and no
marketplace split (so a platform fee cannot be taken inline, and is
recorded as zero rather than pretended).

Owners choose how they take money in **Settings → Payments**: counter
only, online optional, or online required.

### Configuration

Payments are optional — the app runs without any of these, and simply
does not offer online payment.

| Variable | For |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Card payments and billing |
| `STRIPE_PRICE_{SMART,PRO}_{MONTHLY,YEARLY}` | Subscription price ids |
| `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD` | bKash |
| `BKASH_SANDBOX` | Defaults to `true`; set `false` deliberately for live money |

Webhook endpoints: `/api/webhooks/stripe/billing` (subscriptions) and
`/api/webhooks/stripe/orders` (diner payments).

## Build phases

This project is built in the phases described in PROMPT.md §11
(Foundation → Tenancy & Auth → Menu Management → Storefront → Realtime
Ordering → Payments → Growth → i18n → Marketing Site → Hardening). Do not
skip ahead of the current phase's isolation and testing requirements.
