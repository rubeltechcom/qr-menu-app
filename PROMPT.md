# Master Build Prompt — Multi-Tenant QR Menu & Ordering SaaS

> Paste this whole document as the project brief. It is written to be executed in phases; do not attempt to build everything in one pass. Build Phase 0 → 9 in order, and keep every phase shippable on its own.

---

## 1. Product Definition

Build a **production-grade, multi-tenant SaaS platform** that lets restaurants, cafés, bars, food trucks, and hotel chains create digital QR-code menus and take contactless orders (dine-in, takeaway, delivery) without any native app install.

The system has **four distinct surfaces**, each with its own audience and its own performance profile:

| Surface | Audience | Route | Rendering priority |
|---|---|---|---|
| **Marketing site** | Prospective restaurant owners | `www.<domain>` | SEO-critical, mostly static |
| **Tenant storefront** | Diners scanning a QR code | `<slug>.<domain>` or custom domain | Speed-critical, public, indexable |
| **Admin dashboard** | Restaurant owners & managers | `app.<domain>` | Auth-gated, rich interactivity |
| **Staff console** | Waiters, kitchen, counter | `app.<domain>/staff` | Realtime, low-latency, tablet-first |

There is also a **platform superadmin** area for the SaaS operator (tenant management, billing oversight, feature flags, impersonation).

### Success criteria
A restaurant owner must be able to sign up, build a menu, print a QR code, and receive a real order **in under 10 minutes**, with zero help. A diner must be able to scan and see the menu in **under 1.5 seconds on 4G**.

---

## 2. Technology Stack (fixed — do not substitute without stating why)

**Framework & language**
- Next.js 15+ (App Router, React Server Components, Server Actions)
- TypeScript in `strict` mode. `any` is forbidden; use `unknown` + narrowing.
- Node.js 20 LTS runtime

**Data**
- PostgreSQL 16 as the single source of truth
- Prisma ORM with migrations committed to source control
- Redis for: session/rate-limit counters, realtime pub-sub fan-out, background job queue (BullMQ), and hot-path caching

**UI**
- Tailwind CSS with a design-token layer (never raw hex values in components)
- shadcn/ui as the component primitive base, wrapped in a local `@/components/ui` layer so upstream changes never leak into feature code
- `next/image` for all imagery; `next/font` for self-hosted fonts (no render-blocking font CDN)

**Auth**
- Auth.js (NextAuth v5) with database sessions
- Credentials + Google OAuth for restaurant owners
- Short-lived signed PIN sessions for staff devices (a waiter should not need an email login)
- Diners are **anonymous by default** — never force a signup to place an order

**Payments**
- Stripe Billing for SaaS subscriptions (the platform charging restaurants)
- Stripe Connect (Standard accounts) for diner→restaurant order payments, so funds settle directly to the restaurant and the platform takes an application fee
- Pluggable `PaymentProvider` interface so bKash / SSLCommerz / Razorpay can be added later without touching order logic

**Infrastructure**
- Vercel (or any Node host) for the app; Neon/Supabase/RDS for Postgres; Upstash/ElastiCache for Redis
- S3-compatible object storage (R2 or S3) for images, served through a CDN
- Resend or Postmark for transactional email
- Sentry for errors, OpenTelemetry traces, structured JSON logs

---

## 3. Multi-Tenancy Architecture

### 3.1 Isolation model
Use a **shared database with a mandatory `tenantId` discriminator** on every tenant-owned table. This is the right trade-off at this scale: one migration path, cheap to operate, and safe *if and only if* isolation is enforced structurally rather than by developer discipline.

**Enforce it in three layers — all three are required:**

1. **Database layer.** Enable PostgreSQL Row-Level Security on every tenant table. Policies read `current_setting('app.tenant_id')`. Set that GUC at the start of every transaction.
2. **ORM layer.** Wrap Prisma in a `forTenant(tenantId)` factory that returns a client with the tenant filter applied via Prisma Client Extensions. **Feature code must never import the raw Prisma client** — enforce this with an ESLint `no-restricted-imports` rule.
3. **Request layer.** Middleware resolves the tenant from the hostname before any handler runs and puts it in an `AsyncLocalStorage` context. A request with no resolved tenant cannot reach a tenant-scoped handler.

Write an automated test that, for every tenant-scoped model, attempts a cross-tenant read and asserts it returns empty. This test must run in CI and block merges.

### 3.2 Tenant resolution
Resolve in this order:
1. Custom domain exact match (`menu.joespizza.com`) — looked up from a `Domain` table, cached in Redis with a short TTL
2. Platform subdomain (`joespizza.<domain>`)
3. Reserved subdomains (`www`, `app`, `api`, `admin`, `cdn`, `static`, `mail`, `blog`, `help`, `status`) resolve to platform surfaces, never to tenants — keep this blocklist in one shared constant and validate against it at signup

Custom domains: verify ownership via a DNS TXT record, then provision TLS automatically. Store verification state as an explicit enum (`PENDING` → `VERIFYING` → `ACTIVE` → `FAILED`), never as a boolean.

### 3.3 Tenant hierarchy
```
Tenant (the billing account / restaurant brand)
 └── Location (a physical venue — its own address, hours, menu overrides, staff)
      └── Zone (floor, terrace, garden — optional grouping)
           └── Table (a QR target; has a number, capacity, and stable public code)
```
Subscription limits apply at the **Tenant** level and are counted in **Locations**, matching the pricing model below.

---

## 4. Data Model

Define these Prisma models. Every tenant-owned model carries `tenantId`, `createdAt`, `updatedAt`, and a soft-delete `deletedAt`.

**Platform & identity**
- `Tenant` — slug, name, plan, subscription status, Stripe customer/subscription IDs, Connect account ID, default locale, currency, feature flags (JSONB)
- `User` — email, hashed password, name, avatar, global role (`SUPERADMIN` | `USER`)
- `Membership` — joins User↔Tenant with a role: `OWNER`, `MANAGER`, `WAITER`, `KITCHEN`, `ACCOUNTANT`. Scope optionally to specific Locations.
- `StaffPin` — hashed PIN, tied to a Membership, for tablet login
- `AuditLog` — actor, action, entity type/id, before/after diff, IP, user agent

**Storefront content**
- `Location` — name, address, geo coordinates, timezone, phone, currency, service settings
- `OpeningHours` — per-day open/close windows, plus `SpecialDate` overrides for holidays
- `Zone`, `Table` — table has a `publicCode` (short, non-sequential, unguessable) used in QR URLs
- `Menu` — a named menu with an optional availability schedule (Breakfast 07:00–11:00, Late Night, Weekend Brunch)
- `Category` — ordered, with image and description
- `MenuItem` — name, description, base price, images, allergens, dietary tags, calories, prep time, spice level, availability toggle, stock count (nullable = untracked)
- `ModifierGroup` / `Modifier` — e.g. "Choose size" (single-select, required), "Add toppings" (multi-select, max 4), each modifier carrying its own price delta
- `Translation` — polymorphic (`entityType`, `entityId`, `field`, `locale`, `value`, `isMachineTranslated`)

**Ordering**
- `Order` — human-readable order number scoped per location per day, type (`DINE_IN`|`TAKEAWAY`|`DELIVERY`), status, table reference, customer contact, subtotal/tax/tip/delivery/discount/total, payment status, scheduled time, notes
- `OrderItem` — snapshot of name, price, and selected modifiers **at time of order** (never a live join to MenuItem — menu prices change and historical orders must not)
- `OrderEvent` — append-only status transition log with actor and timestamp
- `Payment` — provider, provider reference, amount, currency, status, refunds
- `Cart` — server-side, keyed by an anonymous session cookie, TTL-expired

**Growth**
- `Feedback` — rating, comment, per-order, optionally per-item
- `Promotion` — percentage/fixed/BOGO/free-delivery, code, validity window, usage caps, minimum spend
- `Customer` — phone/email-keyed repeat diner, order history, loyalty points (opt-in, per tenant)
- `WaiterCall` — table service requests (call waiter, request bill)

### Money rule
Store **all monetary values as integers in the currency's minor unit** (cents/paisa). Never use floats. Build a `Money` value object with explicit currency and forbid raw arithmetic on price fields elsewhere.

---

## 5. Backend Requirements

### 5.1 Architecture
Layer the backend and keep the boundaries strict:

```
Route Handler / Server Action   ← HTTP & auth concerns only
        ↓
Service layer                   ← business rules, transactions, events
        ↓
Repository layer                ← tenant-scoped Prisma access
        ↓
Database
```

A service never touches `req`/`res`. A route handler never writes a Prisma query. Organize by **feature module**, not by technical type:

```
src/modules/menu/{menu.service.ts, menu.repository.ts, menu.schema.ts, menu.types.ts}
src/modules/orders/...
src/modules/billing/...
```

This is the single most important decision for long-term maintainability — a new developer should be able to delete one folder and know exactly what broke.

### 5.2 Validation & contracts
- **Zod schemas at every boundary** — request bodies, search params, env vars, webhook payloads, third-party responses
- Parse `process.env` once at boot through a Zod schema; crash loudly on a missing variable rather than failing mysteriously at 3am
- Derive TypeScript types **from** Zod schemas (`z.infer`), never maintain both by hand
- Public REST API under `/api/v1/` with a generated OpenAPI spec, for future POS integrations

### 5.3 Realtime
Orders must reach the kitchen in **under one second**. Use Server-Sent Events over WebSockets — it's simpler, survives proxies, and reconnects natively. Publish through Redis pub/sub so multiple app instances all deliver.

Channels: `tenant:{id}:location:{id}:orders`, `...:tables`, `...:calls`.

Every realtime message must be **idempotent and versioned** — a client that reconnects and replays must converge to the same state. Include a monotonic sequence number and let clients request a delta since their last seen sequence.

### 5.4 Background jobs (BullMQ)
Image processing, machine translation, email/SMS dispatch, receipt generation, nightly analytics rollups, subscription reconciliation, abandoned-cart cleanup, QR PDF generation.

Every job: idempotent, capped retries with exponential backoff, dead-letter queue, structured logging with a correlation ID.

### 5.5 Security (non-negotiable)
- Rate limiting per IP **and** per tenant on all public endpoints, with stricter limits on order creation and auth
- CSRF protection on all mutations; `SameSite=Lax` cookies, `Secure`, `HttpOnly`
- Strict Content-Security-Policy with nonces — no `unsafe-inline`
- Argon2id for password hashing
- All webhooks signature-verified (Stripe especially) and processed idempotently via an event-ID dedupe table
- Never log PII or full payment data; redact at the logger level, not the call site
- Server-side authorization on **every** mutation — a hidden button is not a permission check
- Signed, expiring URLs for uploads; validate MIME by magic bytes, not by file extension
- GDPR: data export and hard-delete endpoints per tenant and per customer

---

## 6. Frontend Requirements

### 6.1 Diner storefront — the surface that decides whether this product succeeds

A hungry person is standing at a table holding a phone on bad restaurant wifi. Every decision follows from that.

**Performance budget (enforce in CI with Lighthouse CI):**
- LCP < 1.5s on 4G · CLS < 0.05 · INP < 200ms
- Initial JS bundle < 100KB gzipped
- Menu HTML is server-rendered and cached at the edge; only the cart is client-interactive

**Behaviour**
- The QR URL is `https://<tenant>/t/<tableCode>` — the table is known immediately, no "select your table" step
- Menu browsing works with **zero JavaScript**; the cart is progressive enhancement
- Sticky category rail directly under the header: small circular category thumbnails (photo or icon) in a horizontally scrollable row, active category highlighted, tapping jumps/scroll-spies to that section — this is the primary navigation, more important than a search box on mobile
- Two-column responsive item grid: photo, name, price, favorite/heart toggle
- Search and dietary filters (vegan, gluten-free, halal, allergen exclusion)
- Item detail sheet with images, description, modifiers, quantity, and special instructions
- Persistent bottom cart bar showing running total and item count (e.g. "Order 1 for 12.25 £") that expands into the full cart/checkout sheet — always visible once the cart is non-empty, never a separate page navigation
- **Checkout sheet fields, in this order:** order-type tabs (Dine In / Takeaway / Delivery — switching type must re-validate required fields), line items with quantity +/− steppers, free-text note field, "when ready" time picker (ASAP vs. scheduled), table identifier (pre-filled from the QR scan for dine-in, hidden for takeaway/delivery, replaced by an address field for delivery), inline validation ("Fill all required fields") rather than a blocking modal, terms/age-confirmation microcopy near the submit button, single ORDER call-to-action
- Cart persists across refresh and accidental tab closure
- Order tracking page with live status, using the same SSE stream
- Call-waiter and request-bill buttons, rate-limited to prevent abuse
- Locale switcher in the header (flag/name control), always visible, never buried in a menu
- RTL layout support for Arabic (test it — do not assume `dir="rtl"` alone is enough)
- Installable PWA with an offline fallback showing the last-cached menu

**Accessibility is a requirement, not a phase-2 nicety:** WCAG 2.1 AA, full keyboard navigation, visible focus rings, 4.5:1 contrast minimum, screen-reader-tested item and cart flows. Some diners have low vision and the restaurant is dim.

### 6.2 Admin dashboard
- **Onboarding wizard** — the 10-minute path: restaurant details → import or build menu → customize theme → print QR codes → go live. Show progress, allow skipping, never dead-end.
- **Menu builder** — drag-and-drop reordering (dnd-kit), inline editing, bulk actions, duplicate item/category, CSV and image-based import, live phone-frame preview beside the editor. Mobile/tablet editing view: category rail with an edit-pencil affordance per category, an "+ Add new dish" tile inline in the item grid (not a separate modal-only flow), and a one-tap availability toggle switch directly on each item card (86'd items go greyed-out immediately, no page reload) alongside its own edit-pencil
- **Location/restaurant settings form** — simple stacked-field form (Restaurant name, Menu language, Country, Timezone, …) with a single Save action; QR code management lives on the same screen: a "Download QR Code" split-button (PNG/SVG/PDF variants) next to "Edit menu", so an owner can get a printable code without hunting through nested settings
- **Order board** — dark sidebar + light content layout; top filter tabs **All / Dine In / Takeaway / Delivery** plus a "hide completed" toggle; each order renders as a card showing order type + sequential number (e.g. "DELIVERY #10500"), placed-at timestamp, line items with quantity and price, computed total, and — for takeaway/delivery — customer name/email/phone/address; each pending card carries two primary actions, **Reject** (destructive, asks for a reason) and **Ready/Accept** (advances status); an explicit empty state ("No Orders") rather than a blank screen; sound and browser notification on new orders. On narrower/tablet widths, offer a denser compact-card grid mode — each tile reduced to type label, time, table icon+number (or name/address for takeaway/delivery), and order number — so a busy shift can scan 15+ open orders at a glance and drill into any one for the full card
- **QR studio** — per-table or per-location codes, logo embedding, color theming, framed print templates ("Scan to order"), export as print-ready PDF/SVG/PNG
- **Theme editor** — colors, fonts, logo, cover image, layout variant, live preview, all writing to design tokens (never inline styles)
- **Analytics** — revenue over time, top items, peak hours, average order value, scan-to-order conversion, table turnover, item-level profitability. Every chart needs a plain-language "what this means" line; owners are restaurateurs, not analysts.
- **Settings** — locations, staff and roles, opening hours, tax rules, service charge, delivery zones and fees, payment config, notification preferences, domain setup, billing portal

### 6.3 Staff console (tablet-first)
- PIN login, large touch targets, high contrast, designed for a greasy kitchen screen at arm's length
- **Kitchen Display System** — orders as cards, color-coded by elapsed time, one-tap status advance, item-level "ready" marking, audible new-order alert
- **Waiter view** — floor map by table with status colors, open orders, incoming waiter calls, ability to place an order on a diner's behalf
- Must survive network loss: queue actions locally and sync on reconnect. Restaurant wifi is bad wifi.

### 6.4 Shared frontend rules
- Server Components by default; `"use client"` only where interaction genuinely requires it
- Server Actions for mutations, with `useOptimistic` for instant feedback
- TanStack Query only for realtime-refreshed client data
- `nuqs` for URL-synced filter state, so views are shareable and back-button-correct
- Every list has explicit **loading / empty / error** states — an empty menu should teach the owner what to do next, not show a blank page
- Error boundaries per route segment; a broken analytics widget must not take down the order board

---

## 7. SEO — for the marketing site *and* every tenant storefront

This is a genuine competitive advantage: each restaurant's menu page should rank for "<restaurant name> menu" and "<cuisine> near me". Most competitors ship storefronts as client-rendered SPAs and rank for nothing.

### 7.1 Technical foundation
- Server-render every public page; **never** client-render menu content
- Per-tenant `sitemap.xml` generated from live data, plus a sitemap index at the platform root
- Per-tenant `robots.txt`; `noindex` on all `app.` dashboard routes
- Canonical URLs — critical when a tenant has both a platform subdomain and a custom domain (the custom domain is canonical)
- `hreflang` for every locale variant of a menu
- Clean, human-readable URLs: `/menu/pizza/margherita`, not `/item?id=8f2a`
- Metadata via the Next.js Metadata API, generated per page from real data
- OG images generated at the edge with `@vercel/og` — restaurant name, logo, cover photo, rating

### 7.2 Structured data (JSON-LD) — the highest-leverage item
Emit and validate against Google's Rich Results Test:
- `Restaurant` — name, address, geo, phone, `openingHoursSpecification`, `priceRange`, `servesCuisine`, `acceptsReservations`, `hasMenu`
- `Menu` → `MenuSection` → `MenuItem` with `offers` (price, currency, availability), `suitableForDiet`, and `nutrition`
- `AggregateRating` and `Review` from real collected feedback — **only when genuinely present**; fabricated review markup is a manual-action risk and dishonest to diners
- `BreadcrumbList`, `Organization`, `WebSite` with `SearchAction`
- `FAQPage` on marketing pages

### 7.3 Local SEO
- A public, indexable landing page per Location with address, map, hours, phone, and menu highlights
- NAP (name/address/phone) consistency enforced from a single data source
- Google Business Profile connection guidance in onboarding, with a "copy your menu link" action

### 7.4 Marketing site content engine
- MDX blog with proper heading hierarchy, reading time, author schema, and related posts
- Programmatic landing pages: `/qr-menu-for-<cuisine>`, `/<city>-restaurant-qr-menu`, `/alternatives/<competitor>` — generated from a structured content file, not hand-copied
- Comparison, pricing, and use-case pages
- Public customer showcase — real tenant storefronts double as social proof *and* as inbound links

### 7.5 Performance as SEO
Core Web Vitals are ranking inputs. Enforce the budget from §6.1 in CI. Preconnect to the CDN, inline critical CSS, lazy-load below-fold images with correct `width`/`height` to prevent layout shift, and serve AVIF with WebP fallback.

---

## 8. Internationalization

- `next-intl` with locale segments; default locale unprefixed
- 12 launch locales: `en, es, it, fr, de, tr, pt, zh, ar, ja, hi, ru, pl`
- Two distinct translation systems, don't conflate them:
  1. **UI strings** — static message catalogs, versioned in the repo
  2. **Tenant content** (menu items) — stored in the `Translation` table, machine-translated on demand via a queued job, **always editable by the owner**, and flagged in the UI as machine-generated until a human confirms it
- Per-tenant currency with correct `Intl.NumberFormat` display; timezone-correct order timestamps rendered in the *location's* timezone, not the viewer's
- RTL: use logical CSS properties (`margin-inline-start`, not `margin-left`) throughout, so RTL is a data change rather than a stylesheet fork

---

## 9. Billing & Plans

| | **Free** | **Smart** | **Pro** |
|---|---|---|---|
| Price | $0 | $20/mo · $200/yr | $40/mo · $400/yr |
| Locations | 1 | 3 | Unlimited |
| Menu items | 50 | Unlimited | Unlimited |
| Orders | Unlimited | Unlimited | Unlimited |
| Tables/QR codes | 10 | Unlimited | Unlimited |
| Auto-translation | — | ✓ | ✓ (12 languages) |
| Custom domain | — | ✓ | ✓ |
| Custom branding | Basic | ✓ | Full CSS control |
| Feedback & reviews | — | ✓ | ✓ |
| Analytics | Basic | Standard | Advanced + export |
| Staff accounts | 2 | 10 | Unlimited |
| Promotions & loyalty | — | ✓ | ✓ |
| API access | — | — | ✓ |
| POS integration | — | — | ✓ |
| Support | Community | Email | Priority |
| Platform order fee | 1% | 0% | 0% |

**Implementation:** define entitlements as **data, not conditionals**. One `PLANS` config object maps plan → limits and feature flags; a single `can(tenant, 'feature')` helper is the only thing that reads it. Adding a plan must never require touching feature code.

Handle: 14-day Pro trial without a card, proration on upgrade, graceful downgrade (soft-lock excess locations read-only rather than deleting anyone's data), dunning emails on failed payment, a 7-day grace period, and a self-serve Stripe billing portal. Every subscription state change flows through verified webhooks and is reconciled by a nightly job — never trust client-side success redirects.

---

## 10. Quality, Testing & Operations

**Testing pyramid**
- Unit (Vitest): pricing math, modifier calculation, tax/service charge rules, entitlement checks, availability windows
- Integration (Vitest + Testcontainers Postgres): repositories, services, **tenant isolation**, webhook handlers
- E2E (Playwright): scan→order→kitchen→complete, signup→onboard→go-live, subscription upgrade, staff PIN login
- Accessibility: `axe-core` in Playwright on every public page
- Visual regression on the storefront and menu builder

**Gate merges on:** typecheck, lint, unit + integration tests, E2E smoke, Lighthouse budget, and the tenant-isolation suite.

**Operations**
- Structured JSON logs with a request-scoped correlation ID threaded through jobs
- Sentry with tenant and user context attached
- `/api/health` (liveness) and `/api/ready` (dependency checks)
- Dashboards for order-creation latency, realtime delivery lag, failed payments, job queue depth
- Nightly automated backups with a **restore drill documented and actually performed** — an untested backup is not a backup
- Feature flags for risky rollouts; seed script producing a realistic demo tenant

**Documentation (in-repo, kept current)**
`README` (setup in under 10 minutes), `ARCHITECTURE.md` (with diagrams and the reasoning behind each major decision), `CONTRIBUTING.md`, ADRs for significant choices, generated API docs, and a runbook for common incidents.

---

## 11. Build Order

Ship each phase as a working increment. Do not start a phase before the previous one is genuinely done.

- **Phase 0 — Foundation.** Repo, tooling, CI, Docker Compose for local Postgres + Redis, env validation, design tokens, base UI layer, logging, error handling.
- **Phase 1 — Tenancy & auth.** Tenant model, all three isolation layers, RLS policies, subdomain routing, signup, membership roles, the tenant-isolation test suite. *Nothing else is safe to build until this is proven.*
- **Phase 2 — Menu management.** Locations, menus, categories, items, modifiers, image pipeline, the drag-and-drop builder.
- **Phase 3 — Storefront.** Public menu rendering, tables and QR codes, cart, checkout, order placement, full SEO and structured data.
- **Phase 4 — Realtime ordering.** SSE infrastructure, order board, kitchen display, waiter view, notifications, offline queueing.
- **Phase 5 — Payments.** Stripe Connect onboarding, order payments, refunds, Stripe Billing subscriptions, plan entitlements, webhooks.
- **Phase 6 — Growth features.** Feedback, promotions, loyalty, customer records, analytics dashboards.
- **Phase 7 — i18n.** Locale routing, UI catalogs, tenant content translation pipeline, RTL.
- **Phase 8 — Marketing site.** Landing pages, blog, programmatic SEO pages, comparison and pricing pages, showcase.
- **Phase 9 — Hardening.** Load testing, security review, accessibility audit, backup restore drill, documentation, runbooks.

---

## 12. Standing Engineering Principles

Apply these to every file you write:

1. **Boring beats clever.** Someone else maintains this at 2am during a dinner rush.
2. **Colocate by feature, not by type.** Everything about ordering lives in one folder.
3. **Make illegal states unrepresentable.** Discriminated unions over optional-field soup; an order cannot be simultaneously `PENDING` and `refundedAt`.
4. **Parse, don't validate.** Data crosses a boundary once, as a typed value, and is trusted thereafter.
5. **One source of truth per concept.** Prices, tax rules, and entitlements each live in exactly one place.
6. **Explicit over implicit.** Named arguments, no magic strings, no positional booleans.
7. **Errors are values.** Expected failures return typed results; exceptions are for genuinely exceptional cases.
8. **Every external call can fail.** Timeouts, retries, circuit breakers, and a sensible degraded state.
9. **Delete rather than comment out.** Git remembers.
10. **Write the test that would have caught the bug** — especially for tenant isolation and money math.

When a requirement here is ambiguous or you believe it's wrong, say so explicitly and propose the alternative — then proceed with the stated approach unless told otherwise.
