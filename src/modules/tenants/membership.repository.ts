import { rawPrisma } from "@/server/db/client";

/**
 * Memberships join a global User to the tenants they belong to, so they
 * are read BEFORE any tenant is selected — the membership list is what
 * tells the dashboard which tenants a person may pick from.
 *
 * These reads run outside forTenant(), so the database enforces the
 * narrowing instead: the `bootstrap_owner_lookup` policy only returns
 * rows whose userId matches the `app.user_id` GUC set below. That means
 * forgetting the WHERE clause here would return nothing rather than
 * every membership on the platform — the check does not depend on this
 * file staying correct.
 */

/** Runs `fn` with the current user's id visible to RLS. */
function asUser<T>(userId: string, fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return rawPrisma.$transaction(async (tx) => {
    // Transaction-scoped (`true`), so it cannot leak to the next
    // borrower of a pooled connection.
    await tx.$executeRawUnsafe(`select set_config('app.user_id', $1, true)`, userId);
    return fn(tx as TxClient);
  });
}

type TxClient = Parameters<Parameters<typeof rawPrisma.$transaction>[0]>[0];

export function listMembershipsForUser(userId: string) {
  return asUser(userId, (tx) =>
    tx.membership.findMany({
      where: { userId },
      include: { tenant: { select: { id: true, slug: true, name: true, plan: true } } },
      orderBy: { createdAt: "asc" },
    }),
  );
}

/**
 * One membership by tenant slug, for the dashboard's per-tenant pages.
 * Same policy applies: a slug belonging to someone else's restaurant
 * simply returns nothing.
 */
export function findMembershipForUserBySlug(userId: string, tenantSlug: string) {
  return asUser(userId, (tx) =>
    tx.membership.findFirst({
      where: { userId, tenant: { slug: tenantSlug, deletedAt: null } },
      include: { tenant: true },
    }),
  );
}
