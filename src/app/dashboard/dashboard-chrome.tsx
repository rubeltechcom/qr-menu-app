"use client";

import { usePathname } from "next/navigation";
import {
  CreditCard,
  LayoutDashboard,
  QrCode,
  ReceiptText,
  Receipt,
  Shield,
  SlidersHorizontal,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import { AdminLayout, type NavSection } from "@/components/ui/admin-layout";

/**
 * Decides the dashboard's navigation from the current URL.
 *
 * At /dashboard it lists the restaurants you belong to; inside one it
 * lists that restaurant's sections. Reading the path here rather than in
 * the server layout is what makes it update when you navigate — see the
 * note in layout.tsx.
 */
export function DashboardChrome({
  children,
  userEmail,
  userName,
  isSuperadmin,
  restaurants,
  onLogoutAction,
}: {
  children: React.ReactNode;
  userEmail?: string;
  userName?: string;
  isSuperadmin: boolean;
  restaurants: { slug: string; name: string }[];
  onLogoutAction: () => Promise<void>;
}) {
  const pathname = usePathname() ?? "";
  const slug = /^\/dashboard\/([^/]+)/.exec(pathname)?.[1];
  const current = restaurants.find((restaurant) => restaurant.slug === slug);

  const sections: NavSection[] = slug
    ? [
        {
          items: [
            {
              label: "Overview",
              href: `/dashboard/${slug}`,
              icon: <LayoutDashboard className="h-4 w-4" />,
            },
            {
              label: "Orders",
              href: `/dashboard/${slug}/orders`,
              icon: <ReceiptText className="h-4 w-4" />,
              prefix: true,
            },
          ],
        },
        {
          title: "Menu",
          items: [
            {
              label: "Menu & dishes",
              href: `/dashboard/${slug}/menu`,
              icon: <UtensilsCrossed className="h-4 w-4" />,
              prefix: true,
            },
            {
              label: "Tables & QR codes",
              href: `/dashboard/${slug}/tables`,
              icon: <QrCode className="h-4 w-4" />,
              prefix: true,
            },
          ],
        },
        {
          title: "Business",
          items: [
            {
              label: "Payments",
              href: `/dashboard/${slug}/payments`,
              icon: <CreditCard className="h-4 w-4" />,
              prefix: true,
            },
            {
              label: "Plan & billing",
              href: `/dashboard/${slug}/billing`,
              icon: <Receipt className="h-4 w-4" />,
              prefix: true,
            },
            {
              label: "Settings",
              href: `/dashboard/${slug}/settings`,
              icon: <SlidersHorizontal className="h-4 w-4" />,
              prefix: true,
            },
          ],
        },
      ]
    : [
        {
          items: [
            {
              label: "My restaurants",
              href: "/dashboard",
              icon: <Store className="h-4 w-4" />,
            },
          ],
        },
      ];

  // A platform admin working in a restaurant still needs a way back to
  // the admin area without typing the URL.
  if (isSuperadmin) {
    sections.push({
      title: "Platform",
      items: [
        {
          label: "Platform admin",
          href: "/admin",
          icon: <Shield className="h-4 w-4" />,
          prefix: true,
        },
      ],
    });
  }

  return (
    <AdminLayout
      title={current?.name ?? "Dashboard"}
      subtitle={current ? "Restaurant dashboard" : undefined}
      sections={sections}
      userEmail={userEmail}
      userName={userName}
      backLink={slug ? { href: "/dashboard", label: "All restaurants" } : undefined}
      // Only worth showing when there is a choice to make.
      workspaces={
        restaurants.length > 1
          ? restaurants.map((restaurant) => ({
              label: restaurant.name,
              href: `/dashboard/${restaurant.slug}`,
              current: restaurant.slug === slug,
            }))
          : undefined
      }
      onLogoutAction={onLogoutAction}
    >
      {children}
    </AdminLayout>
  );
}
