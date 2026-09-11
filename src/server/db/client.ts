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

/**
 * How many database connections this process may hold.
 *
 * Prisma's default is `cpus * 2 + 1`, which on a one-core container is a
 * pool of three. Placing an order opens a transaction that serialises on
 * the location's counter row, so a handful of diners ordering at the
 * same moment need a handful of connections at once — and with three,
 * the rest fail with "Unable to start a transaction in the given time"
 * rather than merely waiting. That is a lost order, not a slow one.
 *
 * Overridable per deployment: a bigger box can afford more, and Postgres
 * itself has a max_connections ceiling shared with every other app on
 * the server, so this must not be raised blindly.
 */
const CONNECTION_LIMIT = Number(process.env.DATABASE_CONNECTION_LIMIT ?? 15);

function connectionUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  // Leave an explicitly-tuned URL alone.
  if (!url || url.includes("connection_limit=")) return url;

  try {
    const parsed = new URL(url);
    parsed.searchParams.set("connection_limit", String(CONNECTION_LIMIT));
    return parsed.toString();
  } catch {
    // Malformed URLs are env.ts's problem to report; fall back rather
    // than crash a module that every request imports.
    return url;
  }
}

export const rawPrisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    datasources: { db: { url: connectionUrl() } },
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = rawPrisma;
}
