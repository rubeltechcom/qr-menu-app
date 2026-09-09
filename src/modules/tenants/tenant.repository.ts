import { createId } from "@paralleldrive/cuid2";
import { rawPrisma } from "@/server/db/client";
import type { CreateTenantInput } from "./tenant.schema";

/**
 * Tenant creation is a deliberate exception to "always use forTenant()".
 *
 * A brand-new tenant has no tenant context yet — there is nothing to
 * scope to before it exists. Row-Level Security on "tenants" uses FORCE
 * ROW LEVEL SECURITY with WITH CHECK (id = current_setting('app.tenant_id')),
 * so we generate the id client-side and set the session's tenant context
 * to that same id immediately before the INSERT. The check then passes
 * because the two values are equal by construction — no policy needs to
 * be weakened, and no other path gets a way to write an arbitrary
 * tenantId. See the migration note in
 * prisma/migrations/20260909183200_tenant_creation_policy.
 *
 * This is the ONLY function in the codebase allowed to use rawPrisma for
 * a tenant-owned table outside of forTenant(). Every other operation on
 * an existing tenant (its Locations, Memberships, Domains, ...) must go
 * through forTenant(tenantId) as usual, once the tenant exists.
 */
export async function createTenantRecord(input: CreateTenantInput) {
  const tenantId = createId();

  return rawPrisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `select set_config('app.tenant_id', $1, true)`,
      tenantId,
    );

    return tx.tenant.create({
      data: {
        id: tenantId,
        slug: input.slug,
        name: input.name,
        defaultLocale: input.defaultLocale,
        currency: input.currency,
        memberships: {
          create: {
            userId: input.ownerUserId,
            role: "OWNER",
          },
        },
      },
    });
  });
}
