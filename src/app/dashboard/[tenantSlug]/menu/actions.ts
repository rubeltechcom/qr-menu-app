"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import * as menuService from "@/modules/menu/menu.service";
import * as locationService from "@/modules/locations/location.service";
import { assertCanCreate } from "@/modules/billing/entitlements";

/**
 * Every action re-establishes the tenant context via
 * requireDashboardTenant() rather than trusting a tenantId passed from
 * the client — a Server Action is a public HTTP endpoint like any
 * other, and the slug in the URL is the only thing we trust to name
 * "which tenant", re-checked against the caller's own membership each
 * time (PROMPT.md §5.5: "Server-side authorization on every mutation").
 *
 * Service calls go inside `withTenant`. The service layer resolves its
 * own scoped client from AsyncLocalStorage, and that store does not
 * survive the await on requireDashboardTenant — calling a service
 * outside the callback throws "No tenant context available".
 */

export async function createLocationAction(tenantSlug: string, formData: FormData) {
  const { db, tenant, withTenant } = await requireDashboardTenant(tenantSlug);
  await assertCanCreate(db, tenant, "locations");

  await withTenant(() =>
    locationService.createMyLocation({
      name: formData.get("name"),
      address: formData.get("address") || undefined,
      timezone: formData.get("timezone") || "UTC",
      currency: formData.get("currency") || "USD",
    }),
  );
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function createMenuAction(tenantSlug: string, formData: FormData) {
  const { withTenant } = await requireDashboardTenant(tenantSlug);
  await withTenant(() =>
    menuService.createMenu({
      locationId: formData.get("locationId"),
      name: formData.get("name"),
    }),
  );
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function createCategoryAction(
  tenantSlug: string,
  menuId: string,
  formData: FormData,
) {
  const { withTenant } = await requireDashboardTenant(tenantSlug);
  await withTenant(() =>
    menuService.createCategory({
      menuId,
      name: formData.get("name"),
      icon: formData.get("icon") || undefined,
      // Empty string means "cleared", which differs from absent.
      imageUrl: (formData.get("imageUrl") as string) || null,
    }),
  );
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function updateCategoryAction(
  tenantSlug: string,
  categoryId: string,
  formData: FormData,
) {
  const { withTenant } = await requireDashboardTenant(tenantSlug);
  await withTenant(() =>
    menuService.updateCategory(categoryId, {
      name: formData.get("name"),
      icon: formData.get("icon") || undefined,
      // Empty string means "cleared", which differs from absent.
      imageUrl: (formData.get("imageUrl") as string) || null,
    }),
  );
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function deleteCategoryAction(tenantSlug: string, categoryId: string) {
  const { withTenant } = await requireDashboardTenant(tenantSlug);
  // Soft delete: the category and its dishes stop appearing on the
  // storefront, but past orders still resolve what was ordered.
  await withTenant(() => menuService.deleteCategory(categoryId));
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

/**
 * Price arrives from a number input as a major-unit string ("8.95").
 * Rounded to the nearest minor unit here so the rest of the app only
 * ever sees the integer cents that PROMPT.md §4 requires.
 */
function priceToCents(value: FormDataEntryValue | null): number {
  return Math.round(Number(value ?? 0) * 100);
}

/** A comma-separated tag field, normalised and de-duplicated. */
function tagList(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * The gallery's image URLs, newline-separated.
 *
 * A newline is safe as a delimiter because a URL can never contain one,
 * unlike a comma. Order is preserved: the first entry is the cover photo
 * the menu grid shows.
 */
function urlList(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  return value
    .split("\n")
    .map((url) => url.trim())
    .filter(Boolean);
}

export async function createMenuItemAction(
  tenantSlug: string,
  categoryId: string,
  formData: FormData,
) {
  const { db, tenant, withTenant } = await requireDashboardTenant(tenantSlug);
  await assertCanCreate(db, tenant, "menuItems");

  const videoUrl = formData.get("videoUrl");

  await withTenant(() =>
    menuService.createMenuItem({
      categoryId,
      name: formData.get("name"),
      description: formData.get("description") || undefined,
      basePriceCents: priceToCents(formData.get("price")),
      images: urlList(formData.get("images")),
      videoUrl: typeof videoUrl === "string" && videoUrl ? videoUrl : undefined,
      dietaryTags: tagList(formData.get("dietaryTags")),
    }),
  );
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function updateMenuItemAction(
  tenantSlug: string,
  itemId: string,
  formData: FormData,
) {
  const { withTenant } = await requireDashboardTenant(tenantSlug);

  const videoUrl = formData.get("videoUrl");

  // The service checks that every URL is this tenant's own upload, and
  // deletes the files this save removes.
  await withTenant(() =>
    menuService.updateMenuItem(itemId, {
      name: formData.get("name"),
      description: formData.get("description") || undefined,
      basePriceCents: priceToCents(formData.get("price")),
      images: urlList(formData.get("images")),
      // Empty string means "cleared", which is different from absent.
      videoUrl: typeof videoUrl === "string" && videoUrl ? videoUrl : null,
      dietaryTags: tagList(formData.get("dietaryTags")),
    }),
  );
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function toggleMenuItemAction(
  tenantSlug: string,
  itemId: string,
  isAvailable: boolean,
) {
  const { withTenant } = await requireDashboardTenant(tenantSlug);
  await withTenant(() => menuService.toggleMenuItemAvailability(itemId, isAvailable));
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function deleteMenuItemAction(tenantSlug: string, itemId: string) {
  const { withTenant } = await requireDashboardTenant(tenantSlug);
  await withTenant(() => menuService.deleteMenuItem(itemId));
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function duplicateMenuItemAction(tenantSlug: string, itemId: string) {
  const { withTenant } = await requireDashboardTenant(tenantSlug);
  await withTenant(() => menuService.duplicateMenuItem(itemId));
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function reorderCategoriesAction(tenantSlug: string, ids: string[]) {
  const { withTenant } = await requireDashboardTenant(tenantSlug);
  await withTenant(() => menuService.reorderCategories({ ids }));
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function reorderMenuItemsAction(tenantSlug: string, ids: string[]) {
  const { withTenant } = await requireDashboardTenant(tenantSlug);
  await withTenant(() => menuService.reorderMenuItems({ ids }));
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}
