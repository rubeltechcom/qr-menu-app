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
