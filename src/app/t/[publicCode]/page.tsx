import { notFound } from "next/navigation";
import type { Metadata } from "next";
import * as tableService from "@/modules/tables/table.service";
import { runWithTenant, requireTenantContext } from "@/server/tenant-context";
import * as menuRepo from "@/modules/menu/menu.repository";
import * as locationRepo from "@/modules/locations/location.repository";

/**
 * The QR landing page — what a diner sees the instant they scan a table.
 *
 * This is the one route that starts with no tenant: the URL carries only
 * the table's publicCode, and resolving it is what establishes which
 * restaurant the request belongs to. From that point on everything runs
 * inside runWithTenant(), so the usual scoping applies.
 *
 * PROMPT.md §1 sets the bar at under 1.5s on 4G, so this page stays a
 * server component with no client JS beyond what ordering needs.
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

  // AsyncLocalStorage context does not survive React's render boundary, so
  // this follows the same shape as require-tenant.ts: enter the context to
  // grab a scoped client, then do the awaiting outside it. Passing `db`
  // explicitly is the pattern the repositories already expect.
  const { db } = runWithTenant(table.tenantId, "", () => requireTenantContext());

  const locations = await locationRepo.listLocations(db);
  const menus = await menuRepo.listMenusForLocation(db, table.locationId);
  const menu = menus[0] ? await menuRepo.getMenuWithContent(db, menus[0].id) : null;
  const locationName = locations.find((l) => l.id === table.locationId)?.name ?? "";

  return (
      <div className="mx-auto min-h-screen w-full max-w-lg px-5 pb-24">
        <header className="pt-8 pb-4">
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Table {table.label}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {locationName}
          </h1>
        </header>

        {!menu || menu.categories.length === 0 ? (
          <p className="mt-10 text-sm text-zinc-600 dark:text-zinc-400">
            This menu isn&apos;t ready yet. Please ask a member of staff.
          </p>
        ) : (
          <>
            {/* Category rail — the horizontal scroller from the reference
                flow. Anchor links rather than client-side tabs so it works
                before any JS loads. */}
            <nav className="sticky top-0 -mx-5 flex gap-2 overflow-x-auto bg-white/90 px-5 py-3 backdrop-blur dark:bg-black/90">
              {menu.categories.map((category) => (
                <a
                  key={category.id}
                  href={`#category-${category.id}`}
                  className="shrink-0 rounded-full border border-zinc-300 px-4 py-1.5 text-sm whitespace-nowrap text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                >
                  {category.name}
                </a>
              ))}
            </nav>

            <div className="mt-4 flex flex-col gap-8">
              {menu.categories.map((category) => (
                <section key={category.id} id={`category-${category.id}`} className="scroll-mt-16">
                  <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
                    {category.name}
                  </h2>

                  <ul className="mt-3 flex flex-col gap-3">
                    {category.items
                      .filter((item) => item.isAvailable)
                      .map((item) => (
                        <li
                          key={item.id}
                          className="flex items-start justify-between gap-4 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-zinc-900 dark:text-zinc-50">
                              {item.name}
                            </p>
                            {item.description && (
                              <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                                {item.description}
                              </p>
                            )}
                          </div>
                          <p className="shrink-0 font-medium text-zinc-900 tabular-nums dark:text-zinc-50">
                            {formatPrice(item.basePriceCents)}
                          </p>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
    </div>
  );
}

/**
 * Prices are stored as integer minor units (PROMPT.md §4's money rule).
 * Currency comes from the location in a later pass — this phase renders
 * the amount only, so no currency symbol is hardcoded here.
 */
function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}
