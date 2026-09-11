import { headers } from "next/headers";
import {
  CreditCard,
  LayoutDashboard,
  QrCode,
  ReceiptText,
  Receipt,
  SlidersHorizontal,
  UtensilsCrossed,
} from "lucide-react";
import { requireAuth } from "@/lib/require-auth";
import { AdminLayout } from "@/components/ui/admin-layout";
import { signOut } from "@/lib/auth";

/**
 * Chrome for the restaurant owner's dashboard.
 *
 * The navigation changes with where you are. At /dashboard it lists the
 * restaurants you belong to; inside one it lists that restaurant's
 * sections — menu, orders, tables and so on. Previously it showed only
 * "My Restaurants" everywhere, so an owner who opened their menu had no
 * way to reach their orders except the browser's back button.
 *
 * The slug is read from the request path rather than passed down,
 * because a layout does not receive the child route's params.
 */
export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  // Set by src/proxy.ts on every request.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const match = /^\/dashboard\/([^/]+)/.exec(pathname);
  const slug = match?.[1];

  const navItems = slug
    ? [
        {
          label: "Overview",
          href: `/dashboard/${slug}`,
          icon: <LayoutDashboard className="h-4 w-4" />,
        },
        {
          label: "Menu",
          href: `/dashboard/${slug}/menu`,
          icon: <UtensilsCrossed className="h-4 w-4" />,
        },
        {
          label: "Orders",
          href: `/dashboard/${slug}/orders`,
          icon: <ReceiptText className="h-4 w-4" />,
        },
        {
          label: "Tables",
          href: `/dashboard/${slug}/tables`,
          icon: <QrCode className="h-4 w-4" />,
        },
        {
          label: "Payments",
          href: `/dashboard/${slug}/payments`,
          icon: <CreditCard className="h-4 w-4" />,
        },
        {
          label: "Billing",
          href: `/dashboard/${slug}/billing`,
          icon: <Receipt className="h-4 w-4" />,
        },
        {
          label: "Settings",
          href: `/dashboard/${slug}/settings`,
          icon: <SlidersHorizontal className="h-4 w-4" />,
        },
      ]
    : [
        {
          label: "My Restaurants",
          href: "/dashboard",
          icon: <LayoutDashboard className="h-4 w-4" />,
        },
      ];

  async function handleLogout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AdminLayout
      title="Dashboard"
      navItems={navItems}
      userEmail={session.user.email ?? undefined}
      userName={session.user.name ?? undefined}
      // Inside a restaurant, the way back to the list of them.
      backLink={slug ? { href: "/dashboard", label: "All restaurants" } : undefined}
      onLogoutAction={handleLogout}
    >
      {children}
    </AdminLayout>
  );
}
