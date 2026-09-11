import { afterAll, describe, expect, it } from "vitest";
import { rawPrisma } from "@/server/db/client";
import { findOrCreateFederatedUser } from "../user.repository";

/**
 * Turning a Google identity into one of our users.
 *
 * The cases that matter are all about an account that already exists.
 * A restaurant owner who signed up with a password and later clicks
 * "Continue with Google" must land in the same account — a second,
 * empty one would look to them like their menu had vanished.
 */

const stamp = Date.now();
const emails = [
  `fed-new-${stamp}@example.test`,
  `fed-existing-${stamp}@example.test`,
  `fed-case-${stamp}@example.test`,
  `fed-named-${stamp}@example.test`,
  `fed-deleted-${stamp}@example.test`,
];

afterAll(async () => {
  await rawPrisma.user.deleteMany({ where: { email: { in: emails } } });
});

describe("findOrCreateFederatedUser", () => {
  it("creates an account on first sign-in, with no password", async () => {
    const user = await findOrCreateFederatedUser({
      email: emails[0]!,
      name: "New Owner",
      avatarUrl: "https://example.test/a.jpg",
    });

    expect(user?.email).toBe(emails[0]);
    expect(user?.name).toBe("New Owner");
    // No password: this account signs in through Google, and the
    // credentials provider refuses a user without one.
    expect(user?.hashedPassword).toBeNull();
  });

  it("reuses the existing account rather than creating a second", async () => {
    const existing = await rawPrisma.user.create({
      data: {
        email: emails[1]!,
        name: "Password Owner",
        hashedPassword: "argon2-placeholder",
      },
    });

    const user = await findOrCreateFederatedUser({
      email: emails[1]!,
      name: "Google Profile Name",
    });

    expect(user?.id).toBe(existing.id);
    // Their password still works: linking Google must not lock somebody
    // out of the login they already use.
    expect(user?.hashedPassword).toBe("argon2-placeholder");
  });

  it("does not overwrite a name the owner set themselves", async () => {
    await rawPrisma.user.create({
      data: { email: emails[3]!, name: "Chosen Name" },
    });

    const user = await findOrCreateFederatedUser({
      email: emails[3]!,
      name: "Google Profile Name",
    });

    expect(user?.name).toBe("Chosen Name");
  });

  it("fills in a name that was missing", async () => {
    await rawPrisma.user.create({ data: { email: emails[2]!, name: null } });

    const user = await findOrCreateFederatedUser({
      email: emails[2]!,
      name: "From Google",
    });

    expect(user?.name).toBe("From Google");
  });

  it("matches case-insensitively", async () => {
    // Google may hand back a differently-cased address than the one
    // typed at signup; a second account would be the wrong answer.
    const user = await findOrCreateFederatedUser({
      email: emails[2]!.toUpperCase(),
      name: null,
    });

    expect(user?.email).toBe(emails[2]);
  });

  it("refuses a suspended account rather than reviving it", async () => {
    await rawPrisma.user.create({
      data: { email: emails[4]!, name: "Gone", deletedAt: new Date() },
    });

    expect(await findOrCreateFederatedUser({ email: emails[4]!, name: null })).toBeNull();
  });
});
