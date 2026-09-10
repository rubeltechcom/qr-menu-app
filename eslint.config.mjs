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
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
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
