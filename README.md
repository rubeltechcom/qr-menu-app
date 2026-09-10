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

## Build phases

This project is built in the phases described in PROMPT.md §11
(Foundation → Tenancy & Auth → Menu Management → Storefront → Realtime
Ordering → Payments → Growth → i18n → Marketing Site → Hardening). Do not
skip ahead of the current phase's isolation and testing requirements.
