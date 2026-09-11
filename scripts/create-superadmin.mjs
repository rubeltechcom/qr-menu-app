/**
 * Creates (or promotes) the platform superadmin account.
 *
 * The superadmin signs in at the ordinary /login page — there is no
 * separate admin login — and the `globalRole` column on their user row
 * is what unlocks /admin. That column is deliberately not settable from
 * anywhere in the UI: the account that can see every restaurant on the
 * platform should only ever be created by someone with server access.
 *
 * Usage, from the app's terminal (in Coolify: the app → Terminal):
 *
 *   npm run superadmin -- you@example.com 'a-strong-password'
 *   npm run superadmin -- you@example.com 'new-password' "Your Name"
 *
 * Run it again with a different password to reset one you have lost.
 * Promoting an existing account keeps its memberships and password;
 * pass a password only if you want to change it.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const [email, password, name] = process.argv.slice(2);

if (!email || !email.includes("@")) {
  console.error("Usage: npm run superadmin -- <email> [password] [name]");
  process.exit(1);
}

// Matches the rule the signup form enforces, so an account made here
// can be changed later through the ordinary flow.
if (password && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/.test(password)) {
  console.error(
    "That password would be rejected by the app. Use at least 10 characters,\n" +
      "with an uppercase letter, a lowercase letter and a number.",
  );
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const normalisedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalisedEmail } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        globalRole: "SUPERADMIN",
        // Clears a soft delete, so a previously removed account can be
        // brought back rather than left unreachable.
        deletedAt: null,
        ...(password ? { hashedPassword: await hash(password) } : {}),
        ...(name ? { name } : {}),
      },
    });

    console.log(`\n✓ ${normalisedEmail} is now a platform superadmin.`);
    if (password) console.log("  Password updated.");
    else console.log("  Existing password kept.");
  } else {
    if (!password) {
      console.error(
        `No account exists for ${normalisedEmail}. Pass a password to create one:\n` +
          `  npm run superadmin -- ${normalisedEmail} 'a-strong-password'`,
      );
      process.exit(1);
    }

    await prisma.user.create({
      data: {
        email: normalisedEmail,
        name: name ?? "Platform Admin",
        hashedPassword: await hash(password),
        globalRole: "SUPERADMIN",
      },
    });

    console.log(`\n✓ Created platform superadmin ${normalisedEmail}.`);
  }

  console.log("\n  Sign in at /login, then open /admin.\n");
} catch (error) {
  console.error("\nFailed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
