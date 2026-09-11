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
      icon: <Shield className="h-4 w-4" />,
    },
    {
      label: "Settings",
      href: "/admin/settings",
      icon: <SlidersHorizontal className="h-4 w-4" />,
    },
    {
      label: "Diagnostics",
      href: "/admin/diagnostics",
      icon: <Stethoscope className="h-4 w-4" />,
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
