import { deleteImageByUrl, isOwnedImageUrl } from "@/modules/storage/upload.service";
import { requireTenantContext } from "@/server/tenant-context";
import {
  createMenuSchema,
  updateMenuSchema,
  createCategorySchema,
  updateCategorySchema,
  createMenuItemSchema,
  updateMenuItemSchema,
  reorderSchema,
} from "./menu.schema";
import * as repo from "./menu.repository";

/**
 * Reject any image URL that is not this tenant's own upload.
 *
 * The schema only checks that a value looks like an image reference.
 * This is the check that matters: it stops one restaurant attaching
 * another's photo by pasting its URL, and stops an arbitrary external
 * URL being stored — which would turn a menu into a way to hotlink
 * someone else's server, or to point our storefront at a tracker.
 *
 * Applied in the service rather than in an action, so every caller —
 * including any future import or API route — is covered by it.
 */
function assertOwnedImages(urls: string[] | undefined, tenantId: string): void {
  for (const url of urls ?? []) {
    if (!isOwnedImageUrl(url, tenantId)) {
      throw new Error("That image isn't one of your uploads.");
    }
  }
}

/**
 * Remove files that a save has orphaned.
 *
 * Best-effort and deliberately not awaited by the caller's transaction:
 * the row is the source of truth, and a photo that outlives it costs a
 * few kilobytes until the sweeper collects it. Failing the owner's save
 * because a file delete failed would be the worse trade.
 */
function discardRemovedImages(before: string[], after: string[], tenantId: string): void {
  for (const url of before) {
    if (!after.includes(url)) void deleteImageByUrl(url, tenantId);
  }
}

// --- Menus -----------------------------------------------------------------

export async function listMenus(locationId: string) {
  const { db } = requireTenantContext();
  return repo.listMenusForLocation(db, locationId);
}

export async function getMenu(menuId: string) {
  const { db } = requireTenantContext();
  return repo.getMenuWithContent(db, menuId);
}

export async function createMenu(input: unknown) {
  const { db, tenantId } = requireTenantContext();
  const parsed = createMenuSchema.parse(input);
  return repo.createMenu(db, tenantId, parsed);
}

export async function updateMenu(id: string, input: unknown) {
  const { db } = requireTenantContext();
  const parsed = updateMenuSchema.parse(input);
  return repo.updateMenu(db, id, parsed);
}

export async function deleteMenu(id: string) {
  const { db } = requireTenantContext();
  return repo.softDeleteMenu(db, id);
}

export async function reorderMenus(input: unknown) {
  const { db } = requireTenantContext();
  const { ids } = reorderSchema.parse(input);
  return repo.reorderMenus(db, ids);
}

// --- Categories --------------------------------------------------------

export async function createCategory(input: unknown) {
  const { db, tenantId } = requireTenantContext();
  const parsed = createCategorySchema.parse(input);
  assertOwnedImages(parsed.imageUrl ? [parsed.imageUrl] : undefined, tenantId);
  return repo.createCategory(db, tenantId, parsed);
}

export async function updateCategory(id: string, input: unknown) {
  const { db, tenantId } = requireTenantContext();
  const parsed = updateCategorySchema.parse(input);
  assertOwnedImages(parsed.imageUrl ? [parsed.imageUrl] : undefined, tenantId);

  // Read the previous photo first, so a replacement does not leave the
  // old file behind. Scoped by the tenant client, so this cannot read
  // another restaurant's row.
  const previous =
    parsed.imageUrl !== undefined
      ? await db.category.findFirst({ where: { id }, select: { imageUrl: true } })
      : null;

  const updated = await repo.updateCategory(db, id, parsed);

  if (previous?.imageUrl) {
    discardRemovedImages(
      [previous.imageUrl],
      parsed.imageUrl ? [parsed.imageUrl] : [],
      tenantId,
    );
  }
  return updated;
}

export async function deleteCategory(id: string) {
  const { db } = requireTenantContext();
  return repo.softDeleteCategory(db, id);
}

export async function reorderCategories(input: unknown) {
  const { db } = requireTenantContext();
  const { ids } = reorderSchema.parse(input);
  return repo.reorderCategories(db, ids);
}

// --- Menu items ----------------------------------------------------------

export async function createMenuItem(input: unknown) {
  const { db, tenantId } = requireTenantContext();
  const parsed = createMenuItemSchema.parse(input);
  assertOwnedImages(parsed.images, tenantId);
  return repo.createMenuItem(db, tenantId, parsed);
}

export async function updateMenuItem(id: string, input: unknown) {
  const { db, tenantId } = requireTenantContext();
  const parsed = updateMenuItemSchema.parse(input);
  assertOwnedImages(parsed.images, tenantId);

  // Photos the owner removed in this save are deleted from storage
  // afterwards; see discardRemovedImages on why this is best-effort.
  const previous =
    parsed.images !== undefined
      ? await db.menuItem.findFirst({ where: { id }, select: { images: true } })
      : null;

  const updated = await repo.updateMenuItem(db, id, parsed);

  if (previous) discardRemovedImages(previous.images, parsed.images ?? [], tenantId);
  return updated;
}

export async function toggleMenuItemAvailability(id: string, isAvailable: boolean) {
  const { db } = requireTenantContext();
  return repo.toggleMenuItemAvailability(db, id, isAvailable);
}

export async function deleteMenuItem(id: string) {
  const { db } = requireTenantContext();
  return repo.softDeleteMenuItem(db, id);
}

export async function reorderMenuItems(input: unknown) {
  const { db } = requireTenantContext();
  const { ids } = reorderSchema.parse(input);
  return repo.reorderMenuItems(db, ids);
}

export async function duplicateMenuItem(id: string) {
  const { db, tenantId } = requireTenantContext();
  return repo.duplicateMenuItem(db, tenantId, id);
}
