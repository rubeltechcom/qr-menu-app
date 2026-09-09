import { rawPrisma } from "./client";

/**
 * Tenant isolation — ORM layer.
 *
 * This is the ONLY way feature code may touch the database (see
 * PROMPT.md §3.1). It returns a Prisma client extension that:
 *   1. Sets the Postgres session GUC `app.tenant_id` at the start of every
 *      interactive transaction, so Row-Level Security policies (the
 *      database layer of defense) can enforce isolation independently of
 *      application code.
 *   2. Automatically injects a `tenantId` filter into every query against
 *      a tenant-owned model, so a bug in application code cannot leak
 *      another tenant's rows even if RLS were ever misconfigured.
 *
 * Every route handler / server action must call forTenant(tenantId) and
 * use the returned client — never the raw client from ./client.ts.
 */

// Models that carry a tenantId column and must always be scoped.
// Keep this list in sync with prisma/schema.prisma. A model left out of
// this list is NOT protected by the auto-filter — the tenant-isolation
// test suite (see src/server/db/__tests__) must cover every entry here.
const TENANT_SCOPED_MODELS = [
  "Tenant", // special-cased below: filtered by id, not tenantId
  "Membership",
  "Domain",
  "Location",
  "Menu",
  "Category",
  "MenuItem",
  "ModifierGroup",
  "Modifier",
  "Translation",
] as const;

export function forTenant(tenantId: string) {
  if (!tenantId) {
    throw new Error("forTenant() called without a tenantId — refusing to build an unscoped client.");
  }

  return rawPrisma.$extends({
    name: "tenant-scoping",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args }) {
          const isScopedModel =
            model && TENANT_SCOPED_MODELS.includes(model as (typeof TENANT_SCOPED_MODELS)[number]);
          const scopeField = model === "Tenant" ? "id" : "tenantId";
          const effectiveOperation =
            isScopedModel && (operation === "findUnique" || operation === "findUniqueOrThrow")
              ? "findFirst"
              : operation;
          const scopedArgs = isScopedModel
            ? injectTenantScope(operation, args as QueryArgs, scopeField, tenantId)
            : args;

          // CRITICAL: set_config(..., true) is scoped to the current
          // transaction on the CURRENT physical connection. Prisma's
          // connection pool does not guarantee that two separately
          // awaited calls on the same PrismaClient share a connection —
          // so setting the GUC and then running the real query as two
          // top-level calls can silently land on different connections,
          // leaving app.tenant_id unset for the query that matters and
          // making every FORCE RLS policy see an empty/null value.
          //
          // $transaction((tx) => ...) is the one construct Prisma
          // guarantees runs on a single connection, so both statements
          // are issued through the SAME tx client here.
          return rawPrisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
              `select set_config('app.tenant_id', $1, true)`,
              tenantId,
            );
            // Re-dispatch the (possibly tenant-scoped) query against
            // the transaction client rather than calling query(args)
            // directly — query() is bound to the extension's original
            // client, not to `tx`, and would not share the connection
            // that just received the GUC.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic dispatch across all Prisma models/operations
            return (tx as any)[uncapitalize(model ?? "")][effectiveOperation](scopedArgs);
          });
        },
      },
    },
  });
}

function uncapitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toLowerCase() + value.slice(1);
}

type QueryArgs = Record<string, unknown>;

function injectTenantScope(
  operation: string,
  args: QueryArgs | undefined,
  scopeField: string,
  tenantId: string,
): QueryArgs {
  const scoped: QueryArgs = { ...(args ?? {}) };

  switch (operation) {
    case "findUnique":
    case "findUniqueOrThrow":
    case "findFirst":
    case "findFirstOrThrow":
    case "findMany":
    case "count":
    case "aggregate":
    case "groupBy":
    case "updateMany":
    case "deleteMany":
    case "update":
    case "delete":
      // AND the caller's own where (which may itself use the scope
      // field as part of a unique key, e.g. findUnique({ where: { id }})
      // for the Tenant model) with the tenant filter, rather than
      // overwriting it. Overwriting would silently substitute the
      // caller's own tenantId/id for whatever they actually asked for —
      // turning "access denied" into "here's a different record",
      // which is worse than an error and was the exact bug this
      // function had. AND-combining means a cross-tenant lookup
      // correctly matches zero rows instead of the wrong row.
      scoped.where = {
        AND: [scoped.where ?? {}, { [scopeField]: tenantId }],
      };
      return scoped;

    case "create":
      if (scopeField === "tenantId") {
        scoped.data = { ...(scoped.data ?? {}), tenantId };
      }
      return scoped;

    case "createMany":
      if (scopeField === "tenantId" && Array.isArray(scoped.data)) {
        scoped.data = scoped.data.map((row: Record<string, unknown>) => ({
          ...row,
          tenantId,
        }));
      }
      return scoped;

    default:
      return scoped;
  }
}

export type TenantPrismaClient = ReturnType<typeof forTenant>;
