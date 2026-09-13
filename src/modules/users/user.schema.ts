import { z } from "zod";
import { tenantSlugSchema } from "@/modules/tenants/tenant.schema";

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.email("Enter a valid email address").toLowerCase(),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(200)
    .regex(/[a-z]/, "Include a lowercase letter")
    .regex(/[A-Z]/, "Include an uppercase letter")
    .regex(/[0-9]/, "Include a number"),
  restaurantName: z.string().trim().min(1, "Restaurant name is required").max(120),
  // The shared rule, not a copy of it. This schema previously carried
  // its own pattern without the reserved-name check, which made signup —
  // the path almost every tenant arrives through — the one route where
  // a slug like `admin` was accepted.
  slug: tenantSlugSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;
