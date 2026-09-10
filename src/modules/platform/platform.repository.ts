import { rawPrisma } from "@/server/db/client";
import { forTenant } from "@/server/db/tenant-client";

/**
 * Platform-wide reads for the superadmin area.
 *
 * The hard part here is that this is the one surface that legitimately
 * looks *across* tenants, while the whole database is built to prevent
 * exactly that. Two options were available and the safer one was taken:
 *
 *   Rejected: grant the app's database role BYPASSRLS. That would
 *   disable every policy in the system for every query the app makes,
 *   not just these — one misplaced import away from a tenant leak. The
 *   RLS migration says explicitly not to do it.
 *
 *   Chosen: list tenants with a narrow, hand-written query that lifts
 *   FORCE for the duration of that single read, then fan out per tenant
 *   through forTenant() for anything deeper. Slower, but the isolation
 *   model stays intact and every per-tenant read is still scoped.
 *
 * Nothing here accepts a filter from a caller, and every function is
 * reachable only behind requireSuperadmin().
 */

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  plan: string;
  subscriptionStatus: string;
  paymentMode: string;
  currency: string;
  connectChargesEnabled: boolean;
  trialEndsAt: Date | null;
  pastDueSince: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
}

/**
 * Every restaurant on the platform.
 *
 * Reads under the `platform_admin_read` policy, enabled by a GUC set
 * inside this transaction only (see the migration for why this is used
 * rather than toggling FORCE, which would disable policies globally for
 * every concurrent request). The policy grants SELECT and nothing else.
 */
export async function listAllTenants(): Promise<TenantSummary[]> {
  return rawPrisma.$transaction(async (tx) => {
    // `true` scopes this to the transaction, so it cannot leak to the
    // next borrower of a pooled connection.
    await tx.$executeRawUnsafe(`select set_config('app.platform_admin', 'on', true)`);
    return tx.$queryRaw<TenantSummary[]>`
      SELECT id, slug, name, plan, "subscriptionStatus", "paymentMode", currency,
             "connectChargesEnabled", "trialEndsAt", "pastDueSince",
             "createdAt", "deletedAt"
      FROM tenants
      ORDER BY "createdAt" DESC
      LIMIT 500
    `;
  });
}

export interface TenantStats {
  locations: number;
  menuItems: number;
  tables: number;
  staff: number;
  orders: number;
  paidOrders: number;
  revenueCents: number;
}

/**
 * Counts for one restaurant, read through its own scoped client — so
 * even the admin panel goes through the same isolation every other
 * caller does.
 */
export async function statsForTenant(tenantId: string): Promise<TenantStats> {
  const db = forTenant(tenantId);

  const [locations, menuItems, tables, staff, orders, paid] = await Promise.all([
    db.location.count({ where: { deletedAt: null } }),
    db.menuItem.count({ where: { deletedAt: null } }),
    db.table.count({ where: { deletedAt: null } }),
    db.membership.count({ where: { deletedAt: null } }),
    db.order.count({}),
    db.payment.findMany({
      where: { status: "PAID" },
      select: { amountCents: true },
    }),
  ]);

  return {
    locations,
    menuItems,
    tables,
    staff,
    orders,
    paidOrders: paid.length,
    revenueCents: paid.reduce((sum, payment) => sum + payment.amountCents, 0),
  };
}

/** Platform totals for the dashboard header. */
export async function platformTotals() {
  const tenants = await listAllTenants();
  const active = tenants.filter((tenant) => !tenant.deletedAt);

  const byPlan = active.reduce<Record<string, number>>((acc, tenant) => {
    acc[tenant.plan] = (acc[tenant.plan] ?? 0) + 1;
    return acc;
  }, {});

  return {
    tenants,
    totalTenants: active.length,
    byPlan,
    pastDue: active.filter((tenant) => tenant.pastDueSince !== null).length,
    trialing: active.filter((tenant) => tenant.subscriptionStatus === "TRIALING").length,
  };
}

/**
 * Suspend or restore a restaurant.
 *
 * Soft delete only. Removing a restaurant's data because their card
 * failed would be catastrophic and irreversible; setting deletedAt
 * stops the storefront resolving while leaving every menu, table and
 * historical order exactly where it was.
 */
export async function setTenantSuspended(
  tenantId: string,
  suspended: boolean,
): Promise<void> {
  await rawPrisma.$transaction(async (tx) => {
    // Writing to a FORCE RLS table needs the tenant context set, the
    // same way tenant creation does.
    await tx.$executeRawUnsafe(`select set_config('app.tenant_id', $1, true)`, tenantId);
    await tx.$executeRawUnsafe(
      `UPDATE tenants SET "deletedAt" = ${suspended ? "now()" : "NULL"} WHERE id = $1`,
      tenantId,
    );
  });
}
