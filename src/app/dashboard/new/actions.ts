"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireAuth } from "@/lib/require-auth";
import { createTenantRecord } from "@/modules/tenants/tenant.repository";
import { createTenantSchema } from "@/modules/tenants/tenant.schema";

export interface CreateRestaurantState {
  error?: string;
}

/**
 * Creates a restaurant for the signed-in user, who becomes its owner.
 *
 * The signup form creates a user and a restaurant together, but a
 * Google sign-in only creates the user — Google has no idea what the
 * restaurant is called. Without this the owner would land on an empty
 * dashboard reading "no restaurants found" with nothing to click, which
 * is where the Google button would otherwise have left them.
 *
 * Also useful for an owner opening a second site, which previously
 * required a whole second account.
 */
export async function createRestaurantAction(
  _prevState: CreateRestaurantState,
  formData: FormData,
): Promise<CreateRestaurantState> {
  const session = await requireAuth();

  let slug: string;

  try {
    const input = createTenantSchema.parse({
      name: formData.get("name"),
      slug: formData.get("slug"),
      ownerUserId: session.user.id,
      defaultLocale: String(formData.get("defaultLocale") || "en"),
      currency: String(formData.get("currency") || "USD"),
    });

    const tenant = await createTenantRecord(input);
    slug = tenant.slug;
  } catch (error) {
    if (error instanceof ZodError) {
      return { error: error.issues[0]?.message ?? "Please check the form." };
    }
    // Prisma's unique constraint on the slug.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return { error: "That menu address is already taken." };
    }

    console.error("[dashboard] failed to create restaurant", error);
    return { error: "Could not create that restaurant. Please try again." };
  }

  // Outside the try: redirect() signals by throwing, and catching it
  // here would turn a successful creation into "please try again".
  revalidatePath("/dashboard");
  redirect(`/dashboard/${slug}`);
}
