import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local throwaway debug scripts. Gitignored, so CI never sees them,
    // but they should not fail a developer's own lint run either.
    "scratch.js",
    "scratch.*.js",
    "scratch/**",
    // Runtime-written uploads.
    "var/**",
  ]),
  {
    // Enforce the tenancy isolation boundary from PROMPT.md §3.1: feature
    // code must never import the raw Prisma client directly. All tenant
    // data access goes through the tenant-scoped repository layer in
    // src/server/db (see forTenant()).
    files: ["src/**/*.{ts,tsx}"],
    // The exceptions below all share one shape: they run BEFORE a tenant
    // is known, or operate on a table that is deliberately global. Each
    // file documents its own reasoning at the top — read that before
    // adding to this list, and do not add anything that merely finds
    // forTenant() inconvenient.
    ignores: [
      "src/server/db/**",
      // Tests set up and tear down fixtures across tenants, and the
      // isolation suite exists specifically to prove that the raw client
      // is still blocked by RLS — it has to be able to reach for it.
      "src/**/__tests__/**",
      // Resolves which tenant a request belongs to, from the hostname.
      "src/modules/tenants/tenant-resolver.ts",
      // Creates the tenant row itself — there is no tenant to scope to yet.
      "src/modules/tenants/tenant.repository.ts",
      // Users are global identity (one person, many tenants via Membership).
      "src/modules/users/user.repository.ts",
      // Memberships are read before a tenant is chosen — they are the list
      // of tenants a person may choose from.
      "src/modules/tenants/membership.repository.ts",
      // Resolves the dashboard's tenant from the signed-in user's Membership.
      "src/lib/require-dashboard-tenant.ts",
      // Staff PIN login: finds the membership that establishes the tenant.
      "src/modules/auth/staff-pin.service.ts",
      "src/app/staff/login/actions.ts",
      // The QR entry point resolves a table before any tenant is known —
      // it is what establishes the tenant. See the comment on
      // resolveTableByPublicCode(); the `public_code_lookup` RLS policy
      // is what keeps that read narrow.
      "src/modules/tables/table.repository.ts",
      // The same shape for a shop's own link: /<slug> carries no tenant,
      // and resolving the slug is what establishes one. A shop with no
      // tables has no publicCode to resolve, so this is its only entry
      // point. The `storefront_slug_lookup` policy pins the read to the
      // single shop the URL names — see storefront.repository.ts.
      "src/modules/tenants/storefront.repository.ts",
      // Same shape for a diner's order-tracking token — see
      // resolveTenantByTrackToken() and the track_token_lookup policy.
      "src/modules/orders/order.repository.ts",
      // Billing runs where no tenant scope exists: a Stripe webhook has
      // no session at all, and the nightly reconciliation job runs
      // headless. Every query in these two is narrowed to a single
      // tenant id resolved from the verified event.
      "src/modules/billing/billing.service.ts",
      "src/modules/billing/connect.service.ts",
      "src/app/api/webhooks/**",
      // A diner returning from a provider, and a provider webhook, both
      // arrive with no tenant — the payment id or track token IS what
      // establishes it. See the bootstrap_payment_lookup policy.
      "src/modules/payments/payment.repository.ts",
      // The one surface that legitimately looks ACROSS tenants: the
      // platform operator's admin area. It reads under a dedicated
      // SELECT-only policy gated on a transaction-local GUC, never by
      // disabling RLS — see the platform_admin_read migration — and is
      // reachable only behind requireSuperadmin().
      "src/modules/platform/platform.repository.ts",
      // Platform-wide configuration has no tenantId to scope by, and is
      // read at boot before any request — let alone any tenant — exists.
      // The table carries no tenant data; access is gated by
      // requireSuperadmin() on the only surface that writes it.
      "src/modules/platform/settings.service.ts",
      // Staff sign in with a restaurant slug and a PIN, holding no
      // session and no tenant, so both reads happen through a narrow
      // SELECT-only RLS window gated on transaction-local GUCs — see
      // the staff_login_lookup migration.
      "src/modules/auth/staff-login.repository.ts",
      "src/modules/auth/staff-pin.service.ts",
      // The health check proves the database connection works at all.
      // It reads no rows and touches no tenant data — `SELECT 1`.
      "src/app/api/health/route.ts",
    ],
    rules: {
      // The @typescript-eslint variant, not the base rule — only it
      // understands allowTypeImports, which is what lets generated
      // Prisma *types* through while still blocking the runtime client.
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              // Types are exempt: `import type { OrderStatus }` pulls in
              // no runtime client and cannot bypass scoping, while
              // hand-copying generated enums would drift from the schema.
              // The runtime client is what this rule is guarding.
              allowTypeImports: true,
              message:
                "Do not import @prisma/client directly. Use the tenant-scoped client from '@/server/db' (forTenant) so row-level isolation is always enforced.",
            },
            {
              // Importing rawPrisma sidesteps both the auto-filter and the
              // GUC that RLS reads, so an unscoped query returns nothing
              // rather than leaking — but it fails silently and confusingly.
              // Any genuine exception belongs in the ignores list above,
              // with a comment saying why it is safe.
              name: "@/server/db/client",
              message:
                "Do not import rawPrisma in feature code. Use forTenant() via requireTenantContext() so tenant scoping and RLS both apply.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
