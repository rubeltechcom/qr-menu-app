import { z } from "zod";
import { RESERVED_SUBDOMAINS } from "@/proxy";

// Slugs become subdomains (<slug>.<APP_DOMAIN>), so they follow DNS label
// rules: lowercase letters, digits, hyphens; no leading/trailing hyphen.
const slugPattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export const createTenantSchema = z.object({
  name: z.string().trim().min(1, "Restaurant name is required").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Must be at least 2 characters")
    .max(63)
    .regex(slugPattern, "Use lowercase letters, numbers, and hyphens only")
    .refine((slug) => !RESERVED_SUBDOMAINS.has(slug), {
      message: "This name is reserved",
    }),
  ownerUserId: z.cuid(),
  defaultLocale: z.string().min(2).max(10).default("en"),
  currency: z.string().length(3).default("USD"),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
