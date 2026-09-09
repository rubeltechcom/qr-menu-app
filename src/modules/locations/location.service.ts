import { requireTenantContext } from "@/server/tenant-context";
import { createLocationSchema, updateLocationSchema } from "./location.schema";
import * as repo from "./location.repository";

/**
 * Thin service layer: parses input, calls the tenant-scoped repository.
 * Route handlers/Server Actions call these — never the repository or
 * Prisma directly (PROMPT.md §5.1's layering).
 */
export async function listMyLocations() {
  const { db } = requireTenantContext();
  return repo.listLocations(db);
}

export async function createMyLocation(input: unknown) {
  const { db, tenantId } = requireTenantContext();
  const parsed = createLocationSchema.parse(input);
  return repo.createLocation(db, tenantId, parsed);
}

export async function updateMyLocation(id: string, input: unknown) {
  const { db } = requireTenantContext();
  const parsed = updateLocationSchema.parse(input);
  return repo.updateLocation(db, id, parsed);
}

export async function deleteMyLocation(id: string) {
  const { db } = requireTenantContext();
  return repo.softDeleteLocation(db, id);
}
