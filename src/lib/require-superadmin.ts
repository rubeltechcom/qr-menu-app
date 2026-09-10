import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/require-auth";
import { findUserById } from "@/modules/users/user.repository";

/**
 * Guard for the platform admin area (PROMPT.md §1: "a platform
 * superadmin area for the SaaS operator").
 *
 * Two decisions worth stating:
 *
 * 1. **The role is re-read from the database on every request**, not
 *    taken from the session JWT. Revoking someone's superadmin has to
 *    take effect immediately — with the role baked into a token they
 *    would keep platform-wide access until it expired, which for the
 *    account that can see every restaurant's revenue is not acceptable.
 *
 * 2. **A non-superadmin gets a 404, not a 403.** A 403 confirms the
 *    area exists and is worth attacking; a 404 tells a logged-in
 *    restaurant owner poking at /admin exactly as much as a stranger
 *    gets.
 */
export async function requireSuperadmin() {
  const session = await requireAuth();

  const user = await findUserById(session.user.id);
  if (!user || user.globalRole !== "SUPERADMIN" || user.deletedAt) {
    notFound();
  }

  return { session, user };
}

/** Non-throwing form, for deciding whether to show a nav link. */
export async function isSuperadmin(userId: string): Promise<boolean> {
  const user = await findUserById(userId);
  return Boolean(user && user.globalRole === "SUPERADMIN" && !user.deletedAt);
}
