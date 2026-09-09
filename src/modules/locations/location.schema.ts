import { z } from "zod";

export const createLocationSchema = z.object({
  name: z.string().trim().min(1, "Location name is required").max(120),
  address: z.string().trim().max(300).optional(),
  timezone: z.string().min(1).max(64).default("UTC"),
  phone: z.string().trim().max(30).optional(),
  currency: z.string().length(3).default("USD"),
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = createLocationSchema.partial();
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
