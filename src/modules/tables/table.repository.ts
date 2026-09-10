import type { TenantPrismaClient } from "@/server/db/tenant-client";
import { rawPrisma } from "@/server/db/client";
import { generatePublicCode } from "./public-code";
import type { CreateTableInput, CreateZoneInput, UpdateTableInput } from "./table.schema";

/**
 * Tenant-scoped access takes a `db` from forTenant() — see PROMPT.md §3.1.
 * The one exception is resolveTableByPublicCode() at the bottom of this
 * file, which is the QR entry point and documented there.
 */

export function listZones(db: TenantPrismaClient, locationId: string) {
  return db.zone.findMany({
    where: { locationId, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export function createZone(db: TenantPrismaClient, tenantId: string, input: CreateZoneInput) {
  return db.zone.create({ data: { tenantId, ...input } });
}

export function listTables(db: TenantPrismaClient, locationId: string) {
  return db.table.findMany({
    where: { locationId, deletedAt: null },
    orderBy: [{ createdAt: "asc" }],
    include: { zone: true },
  });
}

export function getTable(db: TenantPrismaClient, id: string) {
  return db.table.findFirst({ where: { id, deletedAt: null }, include: { zone: true } });
}

/**
 * Create a table, retrying on the (very unlikely) event that a generated
 * publicCode collides with an existing one. The unique index is what
 * actually guarantees uniqueness — checking for existence first and then
 * inserting would race with a concurrent create, so we let the database
 * decide and retry on its rejection instead.
 */
export async function createTable(
  db: TenantPrismaClient,
  tenantId: string,
  input: CreateTableInput,
) {
  return withUniquePublicCode((publicCode) =>
    db.table.create({ data: { tenantId, publicCode, ...input } }),
  );
}

export async function createTableRange(
  db: TenantPrismaClient,
  tenantId: string,
  params: { locationId: string; zoneId?: string; from: number; to: number; prefix: string },
): Promise<{ created: number; skipped: string[] }> {
  const skipped: string[] = [];
  let created = 0;

  // One row at a time rather than createMany, because each row needs its
  // own collision retry and because a label clash with an existing table
  // should skip that one label — not abort the other 19 the owner asked
  // for. The range cap in the schema keeps this bounded.
  for (let n = params.from; n <= params.to; n += 1) {
    const label = `${params.prefix}${n}`;
    try {
      await withUniquePublicCode((publicCode) =>
        db.table.create({
          data: {
            tenantId,
            locationId: params.locationId,
            zoneId: params.zoneId,
            label,
            publicCode,
          },
        }),
      );
      created += 1;
    } catch (error) {
      if (isUniqueViolation(error, "label")) {
        skipped.push(label);
        continue;
      }
      throw error;
    }
  }

  return { created, skipped };
}

export function updateTable(db: TenantPrismaClient, id: string, input: UpdateTableInput) {
  return db.table.update({ where: { id }, data: input });
}

export function softDeleteTable(db: TenantPrismaClient, id: string) {
  return db.table.update({ where: { id }, data: { deletedAt: new Date() } });
}

/**
 * Issue a fresh publicCode for a table — the "someone photographed the QR
 * and is ordering from home" recovery. The old code stops resolving the
 * moment this returns.
 */
export function regeneratePublicCode(db: TenantPrismaClient, id: string) {
  return withUniquePublicCode((publicCode) =>
    db.table.update({ where: { id }, data: { publicCode } }),
  );
}

async function withUniquePublicCode<T>(create: (publicCode: string) => Promise<T>): Promise<T> {
  const MAX_ATTEMPTS = 5;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await create(generatePublicCode());
    } catch (error) {
      if (!isUniqueViolation(error, "publicCode")) throw error;
      lastError = error;
    }
  }

  throw lastError;
}

/**
 * Prisma reports a unique-constraint breach as P2002 and names the
 * offending field(s) in meta.target. Narrowing to the specific field
 * matters here: a label clash and a publicCode clash both surface as
 * P2002 but mean completely different things — one is the owner naming
 * two tables "12", the other is a random-code collision worth retrying.
 */
function isUniqueViolation(error: unknown, field: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;

  const target = candidate.meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === "string") return target.includes(field);
  return false;
}

/**
 * Resolve a table from the code in a QR URL.
 *
 * This is the ONE query in the codebase that legitimately runs without a
 * tenant context, because it is what establishes which tenant the request
 * belongs to: the URL (/t/<publicCode>) carries no tenant, and a diner
 * scanning a sticker has no session. Everything downstream of this call
 * runs through forTenant() as normal.
 *
 * It is safe because of three things together:
 *   - `publicCode` is unguessable (see public-code.ts)
 *   - the `public_code_lookup` RLS policy allows this read ONLY while
 *     app.tenant_id is unset, and only for active, non-deleted tables
 *   - it selects the minimum needed to bootstrap tenant context
 */
export async function resolveTableByPublicCode(publicCode: string) {
  return rawPrisma.table.findFirst({
    where: { publicCode, isActive: true, deletedAt: null },
    select: {
      id: true,
      tenantId: true,
      locationId: true,
      label: true,
      zoneId: true,
    },
  });
}
