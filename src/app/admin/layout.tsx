import { requireSuperadmin } from "@/lib/require-superadmin";
import { AdminLayout } from "@/components/ui/admin-layout";
import { Shield, SlidersHorizontal, Stethoscope } from "lucide-react";
import { signOut } from "@/lib/auth";

export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireSuperadmin();

  const navItems = [
    {
      label: "Platform Overview",
      href: "/admin",
      icon: Shield,
    },
    {
      label: "Settings",
      href: "/admin/settings",
      icon: SlidersHorizontal,
    },
    {
      label: "Diagnostics",
      href: "/admin/diagnostics",
      icon: Stethoscope,
    },
  ];

  async function handleLogout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AdminLayout
      title="Platform Admin"
      navItems={navItems}
      userEmail={user.email ?? undefined}
      userName={user.name ?? undefined}
      onLogoutAction={handleLogout}
    >
      {children}
    </AdminLayout>
  );
}
