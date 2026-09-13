import { z } from "zod";
import { RESERVED_SLUGS } from "@/proxy";

// Slugs become subdomains (<slug>.<APP_DOMAIN>), so they follow DNS label
// rules: lowercase letters, digits, hyphens; no leading/trailing hyphen.
const slugPattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * The one slug rule, exported because a tenant can be created from more
 * than one place.
 *
 * Signup, the admin's create-tenant form, and the dashboard's "add a
 * restaurant" all end at createTenantRecord(), which trusts what it is
 * given. When each caller carried its own copy of these rules, they
 * drifted: the signup path kept the pattern but lost the reserved-name
 * check, so the busiest route into the product was the one place a
 * tenant could claim `admin` or `api`. Exporting the rule rather than
 * the regex is what stops that happening again.
 */
export const tenantSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Must be at least 2 characters")
  .max(63)
  .regex(slugPattern, "Use lowercase letters, numbers, and hyphens only")
  .refine((slug) => !RESERVED_SLUGS.has(slug), {
    message: "This name is reserved",
  });

export const createTenantSchema = z.object({
  name: z.string().trim().min(1, "Restaurant name is required").max(120),
  slug: tenantSlugSchema,
  ownerUserId: z.cuid(),
  defaultLocale: z.string().min(2).max(10).default("en"),
  currency: z.string().length(3).default("USD"),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
