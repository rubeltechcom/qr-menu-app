import { z } from "zod";

export const createMenuSchema = z.object({
  locationId: z.cuid(),
  name: z.string().trim().min(1, "Menu name is required").max(120),
  availableFrom: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm")
    .optional(),
  availableTo: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm")
    .optional(),
});
export type CreateMenuInput = z.infer<typeof createMenuSchema>;

export const updateMenuSchema = createMenuSchema.partial().omit({ locationId: true }).extend({
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;

export const createCategorySchema = z.object({
  menuId: z.cuid(),
  name: z.string().trim().min(1, "Category name is required").max(120),
  description: z.string().trim().max(500).optional(),
  imageUrl: z.url().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial().omit({ menuId: true }).extend({
  sortOrder: z.number().int().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const modifierInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  priceDeltaCents: z.number().int().default(0),
  isAvailable: z.boolean().default(true),
});

export const modifierGroupInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(1),
  modifiers: z.array(modifierInputSchema).default([]),
});

export const createMenuItemSchema = z.object({
  categoryId: z.cuid(),
  name: z.string().trim().min(1, "Item name is required").max(150),
  description: z.string().trim().max(1000).optional(),
  basePriceCents: z.number().int().min(0, "Price cannot be negative"),
  images: z.array(z.url()).default([]),
  allergens: z.array(z.string().trim().min(1)).default([]),
  dietaryTags: z.array(z.string().trim().min(1)).default([]),
  calories: z.number().int().min(0).optional(),
  prepTimeMinutes: z.number().int().min(0).optional(),
  spiceLevel: z.number().int().min(0).max(3).default(0),
  stockCount: z.number().int().min(0).optional(),
  modifierGroups: z.array(modifierGroupInputSchema).default([]),
});
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;

export const updateMenuItemSchema = createMenuItemSchema
  .partial()
  .omit({ categoryId: true, modifierGroups: true })
  .extend({
    isAvailable: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  });
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;

export const reorderSchema = z.object({
  ids: z.array(z.cuid()).min(1),
});
export type ReorderInput = z.infer<typeof reorderSchema>;
