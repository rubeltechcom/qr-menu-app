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

export const updateMenuSchema = createMenuSchema
  .partial()
  .omit({ locationId: true })
  .extend({
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  });
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;

/**
 * An image reference we are willing to store.
 *
 * Uploaded photos are served same-origin under /api/uploads/..., which
 * is a path rather than an absolute URL, so a plain z.url() would reject
 * exactly the case this app produces. Absolute URLs are still accepted
 * for an S3 or CDN install. Whether a given URL is actually *ours* is a
 * separate question, answered by isOwnedImageUrl() at the point of use —
 * this only rejects shapes that could never be an image, such as a
 * `javascript:` or `data:` URL.
 */
const imageRef = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    (value) => value.startsWith("/") || /^https?:\/\//i.test(value),
    "Must be an uploaded image or an https URL",
  )
  .refine((value) => !value.startsWith("//"), "Must not be protocol-relative");

export const createCategorySchema = z.object({
  menuId: z.cuid(),
  name: z.string().trim().min(1, "Category name is required").max(120),
  description: z.string().trim().max(500).optional(),
  // Nullable, so a save can clear an uploaded icon and fall back to
  // the emoji or the name-derived default.
  imageUrl: imageRef.nullish(),
  // One emoji. Capped generously rather than at one code unit, because a
  // single emoji can be several — a skin tone or a ZWJ sequence.
  icon: z.string().trim().max(16).optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema
  .partial()
  .omit({ menuId: true })
  .extend({
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
  // Capped at five: a dish card shows one, the detail sheet a handful,
  // and an unbounded array is a way to fill a disk.
  images: z.array(imageRef).max(5).default([]),
  // One short clip, shown ahead of the photos. Nullable rather than
  // merely optional so a save can clear an existing one.
  videoUrl: imageRef.nullish(),
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
