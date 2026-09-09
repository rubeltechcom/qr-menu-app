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
  return repo.createCategory(db, tenantId, parsed);
}

export async function updateCategory(id: string, input: unknown) {
  const { db } = requireTenantContext();
  const parsed = updateCategorySchema.parse(input);
  return repo.updateCategory(db, id, parsed);
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
  return repo.createMenuItem(db, tenantId, parsed);
}

export async function updateMenuItem(id: string, input: unknown) {
  const { db } = requireTenantContext();
  const parsed = updateMenuItemSchema.parse(input);
  return repo.updateMenuItem(db, id, parsed);
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
