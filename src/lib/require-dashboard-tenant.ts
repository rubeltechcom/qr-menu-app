import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/require-auth";
import { rawPrisma } from "@/server/db/client";
import { runWithTenant, requireTenantContext } from "@/server/tenant-context";

/**
 * Use at the top of any authenticated dashboard page that operates on a
 * specific tenant (menu builder, settings, orders, ...). Unlike
 * requireTenant() (src/lib/require-tenant.ts), which resolves the
 * tenant from the request's hostname for public storefront routes, this
 * resolves it from the logged-in owner/manager's own Membership — the
 * dashboard lives on app.<domain>, not a tenant subdomain.
 *
 * A user with no membership in the given tenant gets a 404 (not a 403)
 * so the existence of a tenant slug isn't leaked to someone probing
 * random URLs while logged in as an unrelated user.
 */
export async function requireDashboardTenant(tenantSlug: string) {
  const session = await requireAuth();

  const membership = await rawPrisma.membership.findFirst({
    where: { userId: session.user.id, tenant: { slug: tenantSlug, deletedAt: null } },
    include: { tenant: true },
  });

  if (!membership) {
    notFound();
  }

  if (membership.role === "WAITER" || membership.role === "KITCHEN") {
    // Staff roles use the PIN-based /staff console, not the owner
    // dashboard, even if they somehow hold a Membership + logged-in
    // session for it.
    redirect("/staff");
  }

  // The AsyncLocalStorage store does not survive React's render boundary
  // (see the note on runWithTenant), so a page that awaits after this
  // returns would find requireTenantContext() empty. Handing back the
  // scoped `db` alongside the context means callers can pass it to a
  // repository directly and never depend on the store still being there.
  const { db } = runWithTenant(membership.tenant.id, membership.tenant.slug, () =>
    requireTenantContext(),
  );

  return {
    session,
    membership,
    tenant: membership.tenant,
    db,
  };
}
