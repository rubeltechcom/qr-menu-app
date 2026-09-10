import { requireAuth } from "@/lib/require-auth";
import { AdminLayout } from "@/components/ui/admin-layout";
import { LayoutDashboard } from "lucide-react";
import { signOut } from "@/lib/auth";

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  const navItems = [
    {
      label: "My Restaurants",
      href: "/dashboard",
      icon: LayoutDashboard,
      active: true,
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
      onLogoutAction={handleLogout}
    >
      {children}
    </AdminLayout>
  );
}
