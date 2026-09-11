import Link from "next/link";
import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import type { TenantPrismaClient } from "@/server/db/tenant-client";
import * as locationRepo from "@/modules/locations/location.repository";
import * as menuRepo from "@/modules/menu/menu.repository";
import { createLocationAction, createMenuAction } from "./actions";
import { AddCategoryButton, EditCategoryButton } from "./category-editor";
import { DishEditor } from "./dish-editor";
import { listAllTranslationsForEntities } from "@/modules/i18n/translation.repository";
import {
  ItemAvailabilityToggle,
  DeleteItemButton,
  DuplicateItemButton,
} from "./item-controls";

/**
 * The menu builder.
 *
 * Laid out the way the finished menu is: a strip of categories across
 * the top, and the dishes of the selected one below as a grid of photo
 * cards. The owner is looking at roughly what their guests will, which
 * is the only reliable way to notice that a dish has no photo or that a
 * price is wrong.
 *
 * Which category is open lives in the URL rather than in state, so the
 * page can stay a server component and a save lands the owner back
 * where they were.
 */

const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Dhaka",
  "Asia/Kolkata",
  "Asia/Dubai",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
];

const CURRENCIES = ["USD", "GBP", "EUR", "BDT", "INR", "AED", "AUD", "CAD"];

/** Mirrors the storefront's fallback, so the editor shows what guests see. */
const CATEGORY_EMOJI: Array<[RegExp, string]> = [
  [/popular/i, "👌"],
  [/curry/i, "🍛"],
  [/ramen|noodle/i, "🍜"],
  [/teppan/i, "🍤"],
  [/donburi|rice|bowl/i, "🍲"],
  [/side|starter|small/i, "🥟"],
  [/dessert|sweet/i, "🍡"],
  [/drink|beverage/i, "🥤"],
];

function iconFor(category: { name: string; icon: string | null }) {
  if (category.icon) return category.icon;
  return CATEGORY_EMOJI.find(([pattern]) => pattern.test(category.name))?.[1] ?? "🍽️";
}

export default async function MenuBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const { tenantSlug } = await params;
  const { category: openCategoryId } = await searchParams;
  const { db, tenant } = await requireDashboardTenant(tenantSlug);

  const locations = await locationRepo.listLocations(db);

  if (locations.length === 0) {
    return <FirstLocationForm tenantSlug={tenantSlug} />;
  }

  const location = locations[0]!;
  const menus = await menuRepo.listMenusForLocation(db, location.id);

  // Languages this restaurant serves. Only when there is more than one
  // does the editor offer translation boxes at all.
  const locales = tenant.locales?.length ? tenant.locales : [tenant.defaultLocale];

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Menu</h1>
          <p className="mt-1 text-sm text-zinc-600">{location.name}</p>
        </div>
        <Link
          href={`/dashboard/${tenantSlug}/tables`}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Table QR codes
        </Link>
      </header>

      {menus.length === 0 ? (
        <FirstMenuForm tenantSlug={tenantSlug} locationId={location.id} />
      ) : (
        <MenuSection
          tenantSlug={tenantSlug}
          menuId={menus[0]!.id}
          openCategoryId={openCategoryId}
          db={db}
          locales={locales}
          defaultLocale={tenant.defaultLocale}
        />
      )}
    </div>
  );
}

async function MenuSection({
  tenantSlug,
  menuId,
  openCategoryId,
  db,
  locales,
  defaultLocale,
}: {
  tenantSlug: string;
  menuId: string;
  openCategoryId?: string;
  db: TenantPrismaClient;
  locales: string[];
  defaultLocale: string;
}) {
  const menu = await menuRepo.getMenuWithContent(db, menuId);
  if (!menu) return null;

  // Falls back to the first category, so the page is never a blank
  // frame waiting for a click.
  const active =
    menu.categories.find((candidate) => candidate.id === openCategoryId) ??
    menu.categories[0];

  // Existing translations for the dishes on screen, in one query rather
  // than one per dish. Skipped entirely for a single-language menu,
  // where the editor shows no translation boxes to fill.
  const translations =
    locales.length > 1 && active
      ? await listAllTranslationsForEntities(
          db,
          active.items.map((item) => item.id),
        )
      : [];

  return (
    <section className="mt-8">
      {/* Category strip */}
      <div className="-mx-6 flex gap-5 overflow-x-auto px-6 pb-4">
        {menu.categories.map((category) => {
          const isActive = category.id === active?.id;
          return (
            <div key={category.id} className="flex shrink-0 flex-col items-center gap-2">
              <Link
                href={`/dashboard/${tenantSlug}/menu?category=${category.id}`}
                scroll={false}
                className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl text-3xl transition-all ${
                  isActive ? "bg-yellow-400 shadow-md" : "bg-zinc-100 hover:bg-zinc-200"
                }`}
              >
                {category.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- uploads
                     may live on a bucket whose host is unknown at build time. */
                  <img
                    src={category.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  iconFor(category)
                )}
              </Link>
              <div className="flex items-center gap-1.5">
                <span
                  className={`max-w-24 truncate text-sm font-medium lowercase ${
                    isActive ? "text-zinc-900" : "text-zinc-600"
                  }`}
                >
                  {category.name}
                </span>
                <EditCategoryButton tenantSlug={tenantSlug} category={category} />
              </div>
            </div>
          );
        })}

        <AddCategoryButton tenantSlug={tenantSlug} menuId={menu.id} />
      </div>

      {!active ? (
        <div className="mt-16 text-center">
          <p className="text-lg font-medium text-zinc-700">Start with a category</p>
          <p className="mt-1 text-sm text-zinc-500">
            Starters, mains, drinks — however your menu is organised.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <DishEditor tenantSlug={tenantSlug} categoryId={active.id} trigger="tile" />

          {active.items.map((item) => (
            <article
              key={item.id}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-opacity ${
                item.isAvailable ? "" : "opacity-60"
              }`}
            >
              <div className="relative aspect-square bg-zinc-100">
                {item.images[0] ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- uploads
                     may be served from a bucket whose host is unknown at build
                     time, so next/image's remotePatterns cannot cover them. */
                  <img
                    src={item.images[0]}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-4xl opacity-20">
                    🍽️
                  </div>
                )}

                <div className="absolute top-2 left-2">
                  <ItemAvailabilityToggle
                    tenantSlug={tenantSlug}
                    itemId={item.id}
                    isAvailable={item.isAvailable}
                  />
                </div>

                <div className="absolute top-2 right-2">
                  <DishEditor
                    tenantSlug={tenantSlug}
                    categoryId={active.id}
                    trigger="pencil"
                    locales={locales}
                    defaultLocale={defaultLocale}
                    translations={translations.filter((row) => row.entityId === item.id)}
                    dish={{
                      id: item.id,
                      name: item.name,
                      description: item.description,
                      basePriceCents: item.basePriceCents,
                      images: item.images,
                      videoUrl: item.videoUrl,
                      dietaryTags: item.dietaryTags,
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-1 flex-col p-3">
                <h3 className="truncate text-sm font-semibold text-zinc-900 lowercase">
                  {item.name}
                </h3>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm font-bold text-zinc-900">
                    {(item.basePriceCents / 100).toFixed(2)}
                  </span>
                  <span className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <DuplicateItemButton tenantSlug={tenantSlug} itemId={item.id} />
                    <DeleteItemButton tenantSlug={tenantSlug} itemId={item.id} />
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function FirstLocationForm({ tenantSlug }: { tenantSlug: string }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
        Where are you serving?
      </h1>
      <p className="mt-2 text-zinc-600">
        A menu belongs to a location. The timezone decides when a day&rsquo;s order
        numbers roll over, and the currency is what your guests see.
      </p>

      <form
        action={createLocationAction.bind(null, tenantSlug)}
        className="mt-8 flex flex-col gap-5"
      >
        <div>
          <label htmlFor="name" className="text-sm font-medium text-zinc-800">
            Location name
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder="Riverside"
            className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 outline-none focus:border-zinc-900"
          />
        </div>

        <div>
          <label htmlFor="address" className="text-sm font-medium text-zinc-800">
            Address <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input
            id="address"
            name="address"
            placeholder="12 Riverside Road"
            className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 outline-none focus:border-zinc-900"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="timezone" className="text-sm font-medium text-zinc-800">
              Timezone
            </label>
            <select
              id="timezone"
              name="timezone"
              defaultValue="UTC"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 outline-none focus:border-zinc-900"
            >
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="currency" className="text-sm font-medium text-zinc-800">
              Currency
            </label>
            <select
              id="currency"
              name="currency"
              defaultValue="USD"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 outline-none focus:border-zinc-900"
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="mt-2 rounded-full bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Continue
        </button>
      </form>
    </div>
  );
}

function FirstMenuForm({
  tenantSlug,
  locationId,
}: {
  tenantSlug: string;
  locationId: string;
}) {
  return (
    <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 p-10 text-center">
      <h2 className="text-lg font-semibold text-zinc-900">Create your menu</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-600">
        Most restaurants need only one. Give it a name and start adding categories.
      </p>

      <form
        action={createMenuAction.bind(null, tenantSlug)}
        className="mx-auto mt-6 flex max-w-sm gap-2"
      >
        <input type="hidden" name="locationId" value={locationId} />
        <input
          name="name"
          placeholder="Main menu"
          required
          className="flex-1 rounded-lg border border-zinc-300 px-3.5 py-2.5 outline-none focus:border-zinc-900"
        />
        <button
          type="submit"
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Create
        </button>
      </form>
    </div>
  );
}
