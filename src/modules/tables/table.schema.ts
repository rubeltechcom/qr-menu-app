import { z } from "zod";

export const createZoneSchema = z.object({
  locationId: z.string().min(1),
  name: z.string().trim().min(1, "Zone name is required").max(120),
  sortOrder: z.number().int().min(0).default(0),
});

export type CreateZoneInput = z.infer<typeof createZoneSchema>;

export const createTableSchema = z.object({
  locationId: z.string().min(1),
  zoneId: z.string().min(1).optional(),
  label: z.string().trim().min(1, "Table label is required").max(40),
  seats: z.number().int().min(1).max(99).optional(),
});

export type CreateTableInput = z.infer<typeof createTableSchema>;

export const updateTableSchema = createTableSchema.partial().omit({ locationId: true });
export type UpdateTableInput = z.infer<typeof updateTableSchema>;

/**
 * Bulk creation is how a restaurant actually sets up: "I have 20 tables,
 * numbered 1 to 20." Doing that one form submission at a time is the kind
 * of onboarding friction that loses a signup, so the range is one action.
 */
export const createTableRangeSchema = z
  .object({
    locationId: z.string().min(1),
    zoneId: z.string().min(1).optional(),
    from: z.number().int().min(1).max(999),
    to: z.number().int().min(1).max(999),
    prefix: z.string().trim().max(20).default(""),
  })
  .refine((v) => v.to >= v.from, {
    message: "The end of the range must not be before the start",
    path: ["to"],
  })
  .refine((v) => v.to - v.from < 200, {
    message: "Create at most 200 tables at a time",
    path: ["to"],
  });

export type CreateTableRangeInput = z.infer<typeof createTableRangeSchema>;
