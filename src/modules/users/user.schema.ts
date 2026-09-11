import { z } from "zod";

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
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(63)
    .regex(
      /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/,
      "Use lowercase letters, numbers, and hyphens only",
    ),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
