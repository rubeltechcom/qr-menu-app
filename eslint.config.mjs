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
    ignores: ["src/server/db/**"],
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
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
