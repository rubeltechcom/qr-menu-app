import { requireSuperadmin } from "@/lib/require-superadmin";
import { AdminLayout, type NavSection } from "@/components/ui/admin-layout";
import {
  BarChart3,
  CreditCard,
  LayoutDashboard,
  Mail,
  Megaphone,
  Store,
  Stethoscope,
  Tags,
} from "lucide-react";
import { signOut } from "@/lib/auth";

/**
 * Chrome for the platform operator's admin area.
 *
 * Grouped rather than a flat list: an operator looking for a Stripe key
 * and one looking for a suspended restaurant are doing different jobs,
 * and a single column of links made both of them read every item.
 */
export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireSuperadmin();

  const sections: NavSection[] = [
    {
      items: [
        {
          label: "Overview",
          href: "/admin",
          icon: <LayoutDashboard className="h-4 w-4" />,
        },
        {
          label: "Restaurants",
          href: "/admin/tenants",
          icon: <Store className="h-4 w-4" />,
          prefix: true,
        },
      ],
    },
    {
      title: "Revenue",
      items: [
        {
          label: "Plans & pricing",
          href: "/admin/plans",
          icon: <Tags className="h-4 w-4" />,
          prefix: true,
        },
        {
          label: "Payments",
          href: "/admin/settings/payments",
          icon: <CreditCard className="h-4 w-4" />,
        },
      ],
    },
    {
      title: "Platform",
      items: [
        {
          label: "Landing page",
          href: "/admin/settings/landing",
          icon: <Megaphone className="h-4 w-4" />,
        },
        {
          label: "Email & SMTP",
          href: "/admin/settings/email",
          icon: <Mail className="h-4 w-4" />,
        },
        {
          label: "General settings",
          href: "/admin/settings",
          icon: <BarChart3 className="h-4 w-4" />,
        },
        {
          label: "Diagnostics",
          href: "/admin/diagnostics",
          icon: <Stethoscope className="h-4 w-4" />,
        },
      ],
    },
  ];

  async function handleLogout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AdminLayout
      title="Platform Admin"
      sections={sections}
      userEmail={user.email ?? undefined}
      userName={user.name ?? undefined}
      externalLink={{ href: "/dashboard", label: "My restaurants" }}
      onLogoutAction={handleLogout}
    >
      {children}
    </AdminLayout>
  );
}
