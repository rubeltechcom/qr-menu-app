import { hashPassword } from "@/lib/password";
import { createUser, findUserByEmail } from "@/modules/users/user.repository";
import { createTenantRecord } from "@/modules/tenants/tenant.repository";
import { signUpSchema, type SignUpInput } from "@/modules/users/user.schema";

export class SignUpError extends Error {
  constructor(
    message: string,
    public readonly field?: "email" | "slug",
  ) {
    super(message);
    this.name = "SignUpError";
  }
}

/**
 * The single signup flow: create the owner's User, then their Tenant
 * (with an OWNER Membership), in that order. If tenant creation fails
 * after the user was created, the user account still exists — this is
 * intentional (they can retry choosing a different restaurant slug
 * without losing their account) rather than wrapping both in one DB
 * transaction, since createTenantRecord already runs its own
 * transaction for the RLS-under-FORCE insert pattern (see
 * tenant.repository.ts).
 */
export async function signUp(input: SignUpInput) {
  const parsed = signUpSchema.parse(input);

  const existing = await findUserByEmail(parsed.email);
  if (existing) {
    throw new SignUpError("An account with this email already exists.", "email");
  }

  const hashedPassword = await hashPassword(parsed.password);
  const user = await createUser({
    name: parsed.name,
    email: parsed.email,
    hashedPassword,
  });

  try {
    const tenant = await createTenantRecord({
      name: parsed.restaurantName,
      slug: parsed.slug,
      ownerUserId: user.id,
      defaultLocale: "en",
      currency: "USD",
    });
    return { user, tenant };
  } catch (error) {
    // Prisma unique constraint violation on the slug.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new SignUpError("That restaurant name is already taken.", "slug");
    }
    throw error;
  }
}
