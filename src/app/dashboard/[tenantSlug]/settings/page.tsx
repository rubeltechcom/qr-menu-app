import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import { BrandingForm } from "./branding-form";

/**
 * The restaurant's own settings: how it presents itself to guests.
 *
 * Distinct from /admin/settings, which is the platform operator's
 * configuration across every restaurant.
 */
export const dynamic = "force-dynamic";

export default async function RestaurantSettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { db, tenant } = await requireDashboardTenant(tenantSlug);

  // Read through the scoped client, so this can only ever be the
  // caller's own restaurant.
  const current = await db.tenant.findFirst({
    where: { id: tenant.id },
    select: { name: true, logoUrl: true, locales: true, defaultLocale: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Settings</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Your name, logo and the languages your menu is offered in.
        </p>
      </div>

      <BrandingForm
        tenantSlug={tenantSlug}
        name={current?.name ?? tenant.name}
        logoUrl={current?.logoUrl ?? null}
        locales={current?.locales ?? []}
        defaultLocale={current?.defaultLocale ?? "en"}
      />
    </div>
  );
}
