import { requireAuth } from "@/lib/require-auth";
import { listMembershipsForUser } from "@/modules/tenants/membership.repository";
import { isSuperadmin } from "@/lib/require-superadmin";
import { signOut } from "@/lib/auth";
import { DashboardChrome } from "./dashboard-chrome";

/**
 * Chrome for the restaurant owner's dashboard.
 *
 * The layout only fetches — which restaurants this user belongs to, and
 * whether they are also a platform admin. Which links to show is decided
 * in DashboardChrome from the live pathname.
 *
 * That split matters: this used to read the path from an `x-pathname`
 * request header, but Next.js keeps a layout mounted across client-side
 * navigations, so the header was only read on a full page load. Opening
 * a restaurant left the nav showing the previous page's links until the
 * browser was refreshed.
 */
export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  const [memberships, isSuper] = await Promise.all([
    listMembershipsForUser(session.user.id),
    isSuperadmin(session.user.id),
  ]);

  async function handleLogout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <DashboardChrome
      userEmail={session.user.email ?? undefined}
      userName={session.user.name ?? undefined}
      isSuperadmin={isSuper}
      restaurants={memberships.map((membership) => ({
        slug: membership.tenant.slug,
        name: membership.tenant.name,
      }))}
      onLogoutAction={handleLogout}
    >
      {children}
    </DashboardChrome>
  );
}
