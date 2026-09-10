import { rawPrisma } from "@/server/db/client";

/**
 * The two reads a staff PIN login needs, before any session exists.
 *
 * Staff arrive with a restaurant slug and a PIN: no logged-in user, and
 * no tenant selected. That satisfies none of the ordinary RLS policies
 * on "tenants" and "memberships" — tenant_isolation wants the tenant id
 * we are trying to find, and bootstrap_tenant_lookup wants a user
 * session that does not exist yet.
 *
 * The `staff_login_*` policies (migration 20260911030000) open a
 * deliberately narrow window for exactly this, gated on GUCs that are
 * set here, transaction-scoped, and never set anywhere else. Keeping
 * both reads in this one file is the point: the window is small, and it
 * is obvious where it opens and closes.
 */

type TxClient = Parameters<Parameters<typeof rawPrisma.$transaction>[0]>[0];

/**
 * Runs `fn` inside the staff-login window.
 *
 * `true` on set_config makes both settings transaction-scoped, so they
 * cannot leak to the next borrower of a pooled connection.
 */
function duringStaffLogin<T>(tenantId: string | null, fn: (tx: TxClient) => Promise<T>) {
  return rawPrisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`select set_config('app.staff_login', 'on', true)`);
    if (tenantId) {
      await tx.$executeRawUnsafe(
        `select set_config('app.staff_login_tenant', $1, true)`,
        tenantId,
      );
    }
    return fn(tx as TxClient);
  });
}

/**
 * The restaurant behind a slug.
 *
 * The slug is public — it is the menu's own subdomain, printed on every
 * QR code in the building — so resolving it grants nothing on its own.
 * The PIN check below is what actually authenticates.
 */
export function findTenantForStaffLogin(slug: string) {
  return duringStaffLogin(null, (tx) =>
    tx.tenant.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true, slug: true, name: true },
    }),
  );
}

/**
 * Every staff PIN belonging to one restaurant, with the person behind
 * it, for the caller to verify a submitted PIN against.
 *
 * Scoped to the one tenant by the policy itself, not just by this WHERE
 * clause — so a mistake here returns nothing rather than another
 * restaurant's roster.
 */
export function listStaffPinsForTenant(tenantId: string) {
  return duringStaffLogin(tenantId, (tx) =>
    tx.staffPin.findMany({
      where: { membership: { tenantId, deletedAt: null } },
      include: { membership: { include: { user: true } } },
    }),
  );
}
