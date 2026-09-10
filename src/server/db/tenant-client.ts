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
  "Zone",
  "Table",
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
          const effectiveOperation = isScopedModel
            ? rewriteOperation(operation)
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
            const delegate = (tx as any)[uncapitalize(model ?? "")];
            const result = await delegate[effectiveOperation](scopedArgs);

            // A single-row write was rewritten to its *Many form above so
            // the tenant filter could be applied (see rewriteOperation).
            // The *Many form returns a count, but the caller asked for the
            // row — so re-read it for update, and reject a no-op outright.
            //
            // Throwing on zero rows is what makes a cross-tenant write
            // fail loudly instead of quietly doing nothing, which is what
            // callers (and the isolation tests) rely on.
            if (isSingleRowWrite(operation)) {
              if (result?.count === 0) {
                throw new Error(
                  `${model}.${operation}() matched no row for this tenant.`,
                );
              }
              if (operation === "update") {
                return delegate.findFirst({ where: (scopedArgs as QueryArgs).where });
              }
              // delete: the row is gone, so return what the caller passed
              // rather than re-reading nothing.
              return { count: result?.count ?? 0 };
            }

            return result;
          });
        },
      },
    },
  });
}

function uncapitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toLowerCase() + value.slice(1);
}

/**
 * Prisma's single-row operations (findUnique, update, delete) require
 * `where` to be a unique key. We AND a tenantId filter into every where
 * clause, which makes it no longer a unique key — so those operations are
 * rewritten to their multi-row equivalents, which accept an arbitrary
 * filter.
 *
 * This is not merely a type workaround: it is what allows the tenant
 * filter to be enforced at all on a lookup by unique key. Without it,
 * `update({ where: { id } })` on another tenant's row would be sent to
 * Postgres unfiltered and stopped only by RLS — one defense instead of two.
 */
function rewriteOperation(operation: string): string {
  switch (operation) {
    case "findUnique":
    case "findUniqueOrThrow":
      return "findFirst";
    case "update":
      return "updateMany";
    case "delete":
      return "deleteMany";
    default:
      return operation;
  }
}

function isSingleRowWrite(operation: string): boolean {
  return operation === "update" || operation === "delete";
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
      // AND the caller's own where (which may itself use the scope
      // field as part of a unique key, e.g. findUnique({ where: { id }})
      // for the Tenant model) with the tenant filter, rather than
      // overwriting it. Overwriting would silently substitute the
      // caller's own tenantId/id for whatever they actually asked for —
      // turning "access denied" into "here's a different record",
      // which is worse than an error and was the exact bug this
      // function had. AND-combining means a cross-tenant lookup
      // correctly matches zero rows instead of the wrong row.
      //
      // `include`/`select` are left untouched here: reads legitimately
      // use them, and stripping them silently returns rows with their
      // relations missing.
      scoped.where = {
        AND: [scoped.where ?? {}, { [scopeField]: tenantId }],
      };
      return scoped;

    case "update":
    case "delete":
      // These alone are rewritten to updateMany/deleteMany (see
      // rewriteOperation), which reject `include`/`select` — so drop them
      // rather than letting Prisma fail on an argument the caller was
      // entitled to pass. Kept as its own case: folding it in with the
      // reads above would strip relations from every query in the app.
      delete scoped.include;
      delete scoped.select;
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
