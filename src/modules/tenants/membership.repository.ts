import { rawPrisma } from "@/server/db/client";

/**
 * Memberships join a global User to the tenants they belong to, so they
 * are read BEFORE any tenant is selected — the membership list is what
 * tells the dashboard which tenants a person may pick from. Like
 * user.repository.ts, this is one of the few places outside forTenant()
 * that touches the raw client, and every query here must be narrowed to
 * a single user's own id.
 */
export function listMembershipsForUser(userId: string) {
  return rawPrisma.membership.findMany({
    where: { userId },
    include: { tenant: { select: { id: true, slug: true, name: true, plan: true } } },
    orderBy: { createdAt: "asc" },
  });
}
