import { notFound } from "next/navigation";
import type { Metadata } from "next";
import * as tableService from "@/modules/tables/table.service";
import { runWithTenant, requireTenantContext } from "@/server/tenant-context";
import * as menuRepo from "@/modules/menu/menu.repository";
import * as locationRepo from "@/modules/locations/location.repository";
import { Storefront, type PaymentMode } from "./storefront";
import { availableProviders } from "@/modules/payments/registry";
import { paymentModeOf } from "@/modules/payments/payment.service";

/**
 * The QR landing page — what a diner sees the instant they scan a table.
 *
 * This is the one route that starts with no tenant: the URL carries only
 * the table's publicCode, and resolving it is what establishes which
 * restaurant the request belongs to. Everything after that runs against
 * a tenant-scoped client.
 *
 * PROMPT.md §1 sets the bar at under 1.5s on 4G, so the menu is rendered
 * on the server and only the cart is client-side.
 */

export const metadata: Metadata = {
  // A menu is per-table and per-session; there is nothing here for a
  // search engine, and indexing table URLs would leak them.
  robots: { index: false, follow: false },
};

export default async function TableLandingPage({
  params,
}: {
  params: Promise<{ publicCode: string }>;
}) {
  const { publicCode } = await params;

  const table = await tableService.resolveTableForStorefront(publicCode);
  // An unknown, retired, or regenerated code is a 404 — never a message
  // that distinguishes "no such table" from "that table is disabled",
  // which would let someone probe for valid codes.
  if (!table) notFound();

  // AsyncLocalStorage context does not survive React's render boundary,
  // so take the scoped client out of the context and pass it explicitly
  // (see the note on runWithTenant).
  const { db } = runWithTenant(table.tenantId, "", () => requireTenantContext());

  const locations = await locationRepo.listLocations(db);
  const location = locations.find((candidate) => candidate.id === table.locationId);

  // How this restaurant takes money, and which providers are actually
  // configured — a button for a provider with no credentials would only
  // fail on tap.
  const tenant = await db.tenant.findFirst({
    where: { id: table.tenantId },
    select: { paymentMode: true },
  });
  const paymentMode: PaymentMode = paymentModeOf({
    paymentMode: tenant?.paymentMode ?? "COUNTER",
  });
  const providers =
    paymentMode === "COUNTER"
      ? []
      : availableProviders().map((provider) => ({
          id: provider.id,
          displayName: provider.displayName,
        }));

  const menus = await menuRepo.listMenusForLocation(db, table.locationId);
  const menu = menus[0] ? await menuRepo.getMenuWithContent(db, menus[0].id) : null;

  const categories = (menu?.categories ?? [])
    .map((category) => ({
      id: category.id,
      name: category.name,
      items: category.items
        .filter((item) => item.isAvailable)
        .map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          basePriceCents: item.basePriceCents,
        })),
    }))
    // A category whose every dish is 86'd would otherwise render as an
    // empty heading the diner cannot act on.
    .filter((category) => category.items.length > 0);

  return (
    <Storefront
      publicCode={publicCode}
      tableLabel={table.label}
      locationName={location?.name ?? ""}
      currency={location?.currency ?? "USD"}
      categories={categories}
      paymentMode={paymentMode}
      providers={providers}
    />
  );
}
