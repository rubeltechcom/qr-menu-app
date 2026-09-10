import { requireTenantContext } from "@/server/tenant-context";
import {
  createTableRangeSchema,
  createTableSchema,
  createZoneSchema,
  updateTableSchema,
} from "./table.schema";
import * as repo from "./table.repository";

/**
 * Thin service layer: parses input, calls the tenant-scoped repository.
 * Server Actions call these — never the repository or Prisma directly.
 */

export async function listMyZones(locationId: string) {
  const { db } = requireTenantContext();
  return repo.listZones(db, locationId);
}

export async function createMyZone(input: unknown) {
  const { db, tenantId } = requireTenantContext();
  const parsed = createZoneSchema.parse(input);
  return repo.createZone(db, tenantId, parsed);
}

export async function listMyTables(locationId: string) {
  const { db } = requireTenantContext();
  return repo.listTables(db, locationId);
}

export async function getMyTable(id: string) {
  const { db } = requireTenantContext();
  return repo.getTable(db, id);
}

export async function createMyTable(input: unknown) {
  const { db, tenantId } = requireTenantContext();
  const parsed = createTableSchema.parse(input);
  return repo.createTable(db, tenantId, parsed);
}

export async function createMyTableRange(input: unknown) {
  const { db, tenantId } = requireTenantContext();
  const parsed = createTableRangeSchema.parse(input);
  return repo.createTableRange(db, tenantId, parsed);
}

export async function updateMyTable(id: string, input: unknown) {
  const { db } = requireTenantContext();
  const parsed = updateTableSchema.parse(input);
  return repo.updateTable(db, id, parsed);
}

export async function deleteMyTable(id: string) {
  const { db } = requireTenantContext();
  return repo.softDeleteTable(db, id);
}

export async function regenerateMyTableCode(id: string) {
  const { db } = requireTenantContext();
  return repo.regeneratePublicCode(db, id);
}

/**
 * The QR entry point. Unscoped by design — see the comment on
 * resolveTableByPublicCode() in the repository.
 */
export async function resolveTableForStorefront(publicCode: string) {
  return repo.resolveTableByPublicCode(publicCode);
}
