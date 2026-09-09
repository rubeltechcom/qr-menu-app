import type { TenantPrismaClient } from "@/server/db/tenant-client";
import type {
  CreateMenuInput,
  UpdateMenuInput,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateMenuItemInput,
  UpdateMenuItemInput,
} from "./menu.schema";

// --- Menus -----------------------------------------------------------------

export function listMenusForLocation(db: TenantPrismaClient, locationId: string) {
  return db.menu.findMany({
    where: { locationId, deletedAt: null },
    orderBy: { sortOrder: "asc" },
  });
}

export function getMenuWithContent(db: TenantPrismaClient, menuId: string) {
  return db.menu.findFirst({
    where: { id: menuId, deletedAt: null },
    include: {
      categories: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            where: { deletedAt: null },
            orderBy: { sortOrder: "asc" },
            include: {
              modifierGroups: {
                orderBy: { sortOrder: "asc" },
                include: { modifiers: { orderBy: { sortOrder: "asc" } } },
              },
            },
          },
        },
      },
    },
  });
}

export function createMenu(db: TenantPrismaClient, tenantId: string, input: CreateMenuInput) {
  return db.menu.create({ data: { tenantId, ...input } });
}

export function updateMenu(db: TenantPrismaClient, id: string, input: UpdateMenuInput) {
  return db.menu.update({ where: { id }, data: input });
}

export function softDeleteMenu(db: TenantPrismaClient, id: string) {
  return db.menu.update({ where: { id }, data: { deletedAt: new Date() } });
}

export function reorderMenus(db: TenantPrismaClient, ids: string[]) {
  return Promise.all(
    ids.map((id, index) => db.menu.update({ where: { id }, data: { sortOrder: index } })),
  );
}

// --- Categories --------------------------------------------------------

export function createCategory(
  db: TenantPrismaClient,
  tenantId: string,
  input: CreateCategoryInput,
) {
  return db.category.create({ data: { tenantId, ...input } });
}

export function updateCategory(db: TenantPrismaClient, id: string, input: UpdateCategoryInput) {
  return db.category.update({ where: { id }, data: input });
}

export function softDeleteCategory(db: TenantPrismaClient, id: string) {
  return db.category.update({ where: { id }, data: { deletedAt: new Date() } });
}

export function reorderCategories(db: TenantPrismaClient, ids: string[]) {
  return Promise.all(
    ids.map((id, index) => db.category.update({ where: { id }, data: { sortOrder: index } })),
  );
}

// --- Menu items ----------------------------------------------------------

export function createMenuItem(
  db: TenantPrismaClient,
  tenantId: string,
  input: CreateMenuItemInput,
) {
  const { modifierGroups, ...itemData } = input;
  return db.menuItem.create({
    data: {
      tenantId,
      ...itemData,
      modifierGroups: {
        create: modifierGroups.map((group, groupIndex) => ({
          tenantId,
          name: group.name,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          sortOrder: groupIndex,
          modifiers: {
            create: group.modifiers.map((modifier, modifierIndex) => ({
              tenantId,
              name: modifier.name,
              priceDeltaCents: modifier.priceDeltaCents,
              isAvailable: modifier.isAvailable,
              sortOrder: modifierIndex,
            })),
          },
        })),
      },
    },
    include: { modifierGroups: { include: { modifiers: true } } },
  });
}

export function updateMenuItem(db: TenantPrismaClient, id: string, input: UpdateMenuItemInput) {
  return db.menuItem.update({ where: { id }, data: input });
}

export function toggleMenuItemAvailability(
  db: TenantPrismaClient,
  id: string,
  isAvailable: boolean,
) {
  return db.menuItem.update({ where: { id }, data: { isAvailable } });
}

export function softDeleteMenuItem(db: TenantPrismaClient, id: string) {
  return db.menuItem.update({ where: { id }, data: { deletedAt: new Date() } });
}

export function reorderMenuItems(db: TenantPrismaClient, ids: string[]) {
  return Promise.all(
    ids.map((id, index) => db.menuItem.update({ where: { id }, data: { sortOrder: index } })),
  );
}

export function duplicateMenuItem(db: TenantPrismaClient, tenantId: string, id: string) {
  return db.$transaction(async (tx) => {
    const original = await tx.menuItem.findFirst({
      where: { id },
      include: { modifierGroups: { include: { modifiers: true } } },
    });
    if (!original) return null;

    return tx.menuItem.create({
      data: {
        tenantId,
        categoryId: original.categoryId,
        name: `${original.name} (copy)`,
        description: original.description,
        basePriceCents: original.basePriceCents,
        images: original.images,
        allergens: original.allergens,
        dietaryTags: original.dietaryTags,
        calories: original.calories,
        prepTimeMinutes: original.prepTimeMinutes,
        spiceLevel: original.spiceLevel,
        stockCount: original.stockCount,
        sortOrder: original.sortOrder + 1,
        modifierGroups: {
          create: original.modifierGroups.map((group) => ({
            tenantId,
            name: group.name,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            sortOrder: group.sortOrder,
            modifiers: {
              create: group.modifiers.map((modifier) => ({
                tenantId,
                name: modifier.name,
                priceDeltaCents: modifier.priceDeltaCents,
                isAvailable: modifier.isAvailable,
                sortOrder: modifier.sortOrder,
              })),
            },
          })),
        },
      },
    });
  });
}
