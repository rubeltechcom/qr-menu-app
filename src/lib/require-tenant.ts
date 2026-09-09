import { notFound } from "next/navigation";
import { resolveTenantFromRequest } from "@/modules/tenants/tenant-resolver";
import { runWithTenant } from "@/server/tenant-context";

/**
 * Use at the top of any public tenant-scoped route (a storefront menu
 * page, a location's ordering page, ...). Resolves the tenant from the
 * request's hostname and returns a scoped db client — a request that
 * cannot be resolved to a tenant renders a 404, per PROMPT.md §3.2,
 * never falls through to an unscoped query.
 *
 * Usage in a server component:
 *   const { tenantId, db } = await requireTenant();
 *   const location = await db.location.findFirst({ ... });
 */
export async function requireTenant() {
  const tenant = await resolveTenantFromRequest();
  if (!tenant) {
    notFound();
  }

  // runWithTenant populates the AsyncLocalStorage context (the request
  // layer of isolation) for anything downstream that calls
  // requireTenantContext() instead of threading the client through
  // props — both patterns are supported, this just also returns the
  // context directly for the common case of "resolve and use it here".
  return runWithTenant(tenant.id, tenant.slug, () => {
    return { tenantId: tenant.id, tenantSlug: tenant.slug };
  });
}
