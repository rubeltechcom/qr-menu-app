import { rawPrisma } from "@/server/db/client";

/**
 * Users are a global identity table (a person can belong to multiple
 * tenants via Membership) and are intentionally NOT tenant-scoped — see
 * the note at the bottom of the row_level_security migration. Reading a
 * user by email for login, or creating one during signup, is therefore
 * one of the few places the raw client is used directly outside
 * forTenant(), same as tenant creation itself.
 */
export function findUserByEmail(email: string) {
  return rawPrisma.user.findUnique({ where: { email } });
}

export function findUserById(id: string) {
  return rawPrisma.user.findUnique({ where: { id } });
}

export function createUser(input: {
  name: string;
  email: string;
  hashedPassword: string;
}) {
  return rawPrisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      hashedPassword: input.hashedPassword,
    },
  });
}

/**
 * The user behind a federated sign-in (Google), created on first use.
 *
 * Matched on email rather than on a provider account id. A restaurant
 * owner who signed up with a password and later clicks "Continue with
 * Google" is the same person and must land in the same account — the
 * alternative is a second, empty account and a support ticket asking
 * where their menu went.
 *
 * That is safe here because the only federated provider is Google,
 * which verifies the address it hands over. Adding a provider that does
 * not verify email would make this a route to taking over an account by
 * claiming somebody else's address, and would need account linking
 * instead.
 *
 * An existing password is left alone: linking Google must not lock
 * somebody out of the login they already use.
 */
export async function findOrCreateFederatedUser(input: {
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}) {
  const email = input.email.toLowerCase();

  const existing = await rawPrisma.user.findUnique({ where: { email } });
  if (existing) {
    // A suspended account must not come back through the side door.
    if (existing.deletedAt) return null;

    // Fill in only what is still missing, so a name the owner set
    // themselves is not overwritten by their Google profile.
    const patch: { name?: string; avatarUrl?: string } = {};
    if (!existing.name && input.name) patch.name = input.name;
    if (!existing.avatarUrl && input.avatarUrl) patch.avatarUrl = input.avatarUrl;

    if (Object.keys(patch).length === 0) return existing;
    return rawPrisma.user.update({ where: { id: existing.id }, data: patch });
  }

  return rawPrisma.user.create({
    data: {
      email,
      name: input.name ?? null,
      avatarUrl: input.avatarUrl ?? null,
      // No password: this account signs in through Google. The
      // Credentials provider already refuses a user without one.
      hashedPassword: null,
    },
  });
}
