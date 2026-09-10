import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import type { TenantPrismaClient } from "@/server/db/tenant-client";
import * as locationRepo from "@/modules/locations/location.repository";
import * as menuRepo from "@/modules/menu/menu.repository";
import {
  createLocationAction,
  createMenuAction,
  createCategoryAction,
  createMenuItemAction,
} from "./actions";
import { ItemAvailabilityToggle, DeleteItemButton, DuplicateItemButton } from "./item-controls";

export default async function MenuBuilderPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { db } = await requireDashboardTenant(tenantSlug);

  const locations = await locationRepo.listLocations(db);

  if (locations.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Add your first location
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          A menu belongs to a location — add one to get started.
        </p>
        <form
          action={createLocationAction.bind(null, tenantSlug)}
          className="mt-6 flex flex-col gap-3"
        >
          <input
            name="name"
            placeholder="Location name (e.g. Main St)"
            required
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            name="address"
            placeholder="Address (optional)"
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="mt-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Create location
          </button>
        </form>
      </div>
    );
  }

  const location = locations[0]!;
  const menus = await menuRepo.listMenusForLocation(db, location.id);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Menu — {location.name}
      </h1>

      {menus.length === 0 && (
        <form
          action={createMenuAction.bind(null, tenantSlug)}
          className="mt-6 flex gap-2"
        >
          <input type="hidden" name="locationId" value={location.id} />
          <input
            name="name"
            placeholder="Menu name (e.g. Main Menu)"
            required
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Create menu
          </button>
        </form>
      )}

      {menus.map((menu) => (
        <MenuSection key={menu.id} tenantSlug={tenantSlug} menuId={menu.id} db={db} />
      ))}
    </div>
  );
}

async function MenuSection({
  tenantSlug,
  menuId,
  db,
}: {
  tenantSlug: string;
  menuId: string;
  db: TenantPrismaClient;
}) {
  const menu = await menuRepo.getMenuWithContent(db, menuId);
  if (!menu) return null;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{menu.name}</h2>

      <form
        action={createCategoryAction.bind(null, tenantSlug, menu.id)}
        className="mt-3 flex gap-2"
      >
        <input
          name="name"
          placeholder="New category (e.g. Starters)"
          required
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
        >
          + Add category
        </button>
      </form>

      <div className="mt-4 flex flex-col gap-6">
        {menu.categories.map((category) => (
          <div key={category.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{category.name}</h3>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {category.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {item.name}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {(item.basePriceCents / 100).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ItemAvailabilityToggle
                      tenantSlug={tenantSlug}
                      itemId={item.id}
                      isAvailable={item.isAvailable}
                    />
                    <DuplicateItemButton tenantSlug={tenantSlug} itemId={item.id} />
                    <DeleteItemButton tenantSlug={tenantSlug} itemId={item.id} />
                  </div>
                </div>
              ))}

              <form
                action={createMenuItemAction.bind(null, tenantSlug, category.id)}
                className="flex flex-col gap-2 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700"
              >
                <input
                  name="name"
                  placeholder="Dish name"
                  required
                  className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <input
                  name="price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Price"
                  required
                  className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <button
                  type="submit"
                  className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
                >
                  + Add dish
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
