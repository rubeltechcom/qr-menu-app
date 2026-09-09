"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import * as menuService from "@/modules/menu/menu.service";
import * as locationService from "@/modules/locations/location.service";

/**
 * Every action re-establishes the tenant context via
 * requireDashboardTenant() rather than trusting a tenantId passed from
 * the client — a Server Action is a public HTTP endpoint like any
 * other, and the slug in the URL is the only thing we trust to name
 * "which tenant", re-checked against the caller's own membership each
 * time (PROMPT.md §5.5: "Server-side authorization on every mutation").
 */

export async function createLocationAction(tenantSlug: string, formData: FormData) {
  await requireDashboardTenant(tenantSlug);
  await locationService.createMyLocation({
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    timezone: formData.get("timezone") || "UTC",
    currency: formData.get("currency") || "USD",
  });
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function createMenuAction(tenantSlug: string, formData: FormData) {
  await requireDashboardTenant(tenantSlug);
  await menuService.createMenu({
    locationId: formData.get("locationId"),
    name: formData.get("name"),
  });
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function createCategoryAction(tenantSlug: string, menuId: string, formData: FormData) {
  await requireDashboardTenant(tenantSlug);
  await menuService.createCategory({
    menuId,
    name: formData.get("name"),
  });
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function createMenuItemAction(
  tenantSlug: string,
  categoryId: string,
  formData: FormData,
) {
  await requireDashboardTenant(tenantSlug);
  const priceDollars = Number(formData.get("price") ?? 0);
  await menuService.createMenuItem({
    categoryId,
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    basePriceCents: Math.round(priceDollars * 100),
  });
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function toggleMenuItemAction(
  tenantSlug: string,
  itemId: string,
  isAvailable: boolean,
) {
  await requireDashboardTenant(tenantSlug);
  await menuService.toggleMenuItemAvailability(itemId, isAvailable);
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function deleteMenuItemAction(tenantSlug: string, itemId: string) {
  await requireDashboardTenant(tenantSlug);
  await menuService.deleteMenuItem(itemId);
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function duplicateMenuItemAction(tenantSlug: string, itemId: string) {
  await requireDashboardTenant(tenantSlug);
  await menuService.duplicateMenuItem(itemId);
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function reorderCategoriesAction(tenantSlug: string, ids: string[]) {
  await requireDashboardTenant(tenantSlug);
  await menuService.reorderCategories({ ids });
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}

export async function reorderMenuItemsAction(tenantSlug: string, ids: string[]) {
  await requireDashboardTenant(tenantSlug);
  await menuService.reorderMenuItems({ ids });
  revalidatePath(`/dashboard/${tenantSlug}/menu`);
}
