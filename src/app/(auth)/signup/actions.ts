"use server";

import { z } from "zod";
import { signUp, SignUpError } from "@/modules/auth/signup.service";
import { signUpSchema } from "@/modules/users/user.schema";
import { signIn } from "@/lib/auth";

export interface SignUpFormState {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof signUpSchema>, string>>;
}

export async function signUpAction(
  _prevState: SignUpFormState,
  formData: FormData,
): Promise<SignUpFormState> {
  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    restaurantName: formData.get("restaurantName"),
    slug: formData.get("slug"),
  };

  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: SignUpFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string") {
        fieldErrors[key as keyof z.infer<typeof signUpSchema>] = issue.message;
      }
    }
    return { fieldErrors };
  }

  try {
    await signUp(parsed.data);
  } catch (error) {
    if (error instanceof SignUpError) {
      return {
        error: error.message,
        fieldErrors: error.field ? { [error.field]: error.message } : undefined,
      };
    }
    throw error;
  }

  // Sign the new owner straight in and send them to their dashboard —
  // no separate "verify your email then log in" hop for the very first
  // action a new tenant takes (PROMPT.md §1: 10 minutes to a live QR).
  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirectTo: "/dashboard",
  });

  return {};
}
