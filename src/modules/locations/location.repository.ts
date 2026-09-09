import type { TenantPrismaClient } from "@/server/db/tenant-client";
import type { CreateLocationInput, UpdateLocationInput } from "./location.schema";

/**
 * All access here takes a tenant-scoped `db` (from forTenant()) rather
 * than importing rawPrisma — see PROMPT.md §3.1. Nothing in this module
 * should ever touch the raw client.
 */
export function listLocations(db: TenantPrismaClient) {
  return db.location.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
}

export function getLocation(db: TenantPrismaClient, id: string) {
  return db.location.findFirst({ where: { id, deletedAt: null } });
}

export function createLocation(
  db: TenantPrismaClient,
  tenantId: string,
  input: CreateLocationInput,
) {
  return db.location.create({
    data: { tenantId, ...input },
  });
}

export function updateLocation(db: TenantPrismaClient, id: string, input: UpdateLocationInput) {
  return db.location.update({ where: { id }, data: input });
}

export function softDeleteLocation(db: TenantPrismaClient, id: string) {
  return db.location.update({ where: { id }, data: { deletedAt: new Date() } });
}
