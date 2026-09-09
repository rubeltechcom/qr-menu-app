import { PrismaClient } from "@prisma/client";

/**
 * The single, process-wide raw Prisma client. This file is the ONLY place
 * in the codebase allowed to import "@prisma/client" directly (enforced by
 * the no-restricted-imports rule in eslint.config.mjs). Everything else
 * must go through forTenant() in ./tenant-client.ts.
 */
declare global {
  // `var` is required here — this augments the global scope, which `let`/`const` cannot do.
  var __prisma: PrismaClient | undefined;
}

export const rawPrisma =
  globalThis.__prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = rawPrisma;
}
