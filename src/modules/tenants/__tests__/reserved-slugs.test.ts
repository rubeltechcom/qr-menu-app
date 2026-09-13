import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS } from "@/proxy";
import { createTenantSchema } from "../tenant.schema";
import { signUpSchema } from "@/modules/users/user.schema";

/**
 * A tenant slug must never shadow a platform surface.
 *
 * Two failures this guards, both of which were real:
 *
 *   1. The reserved list held DNS names only — `www`, `api`, `admin` —
 *      from when a storefront was always a subdomain. Once a shop link
 *      is a path (/m/<slug>, and /<slug> if that is ever adopted), a
 *      tenant named `dashboard` sits on top of the operator's console.
 *
 *   2. signUpSchema carried its own copy of the slug rules and had
 *      dropped the reserved check. Signup and the admin's create-tenant
 *      form both run through it, so the two busiest routes into the
 *      product were the two that did not enforce the list.
 *
 * The directory scan below is the part that keeps this true: adding a
 * route under src/app/ without reserving its name fails here rather
 * than the first time a tenant happens to choose it.
 */

const VALID_BASE = {
  name: "Rubel Furniture",
  ownerUserId: "clh3k2j1x0000qwer1234asdf",
  defaultLocale: "en",
  currency: "USD",
};

const SIGNUP_BASE = {
  name: "Rubel Mondol",
  email: "owner@example.com",
  password: "Str0ngPassword",
  restaurantName: "Rubel Furniture",
};

/** Route segments Next.js serves from src/app/, ignoring its conventions. */
function topLevelRoutes(): string[] {
  const appDir = join(process.cwd(), "src", "app");

  return readdirSync(appDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    // (auth) and (marketing) are route groups: parentheses mean the
    // segment is organisational and never appears in a URL, so they
    // cannot collide with a slug.
    .filter((entry) => !entry.name.startsWith("("))
    // A dynamic segment like [publicCode] matches anything, so it is not
    // a fixed name a tenant could take.
    .filter((entry) => !entry.name.startsWith("["))
    .filter((entry) => !entry.name.startsWith("_"))
    .map((entry) => entry.name);
}

describe("RESERVED_SLUGS", () => {
  it("covers every top-level route under src/app/", () => {
    const missing = topLevelRoutes().filter((route) => !RESERVED_SLUGS.has(route));

    expect(
      missing,
      `These routes exist but are not reserved, so a tenant could claim ` +
        `them and shadow the route: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("still reserves the infrastructure hostnames", () => {
    for (const hostname of ["www", "api", "cdn", "mail"]) {
      expect(RESERVED_SLUGS.has(hostname)).toBe(true);
    }
  });
});

describe("createTenantSchema", () => {
  it("accepts an ordinary shop name", () => {
    const result = createTenantSchema.safeParse({ ...VALID_BASE, slug: "rubel-furniture" });
    expect(result.success).toBe(true);
  });

  it("rejects a reserved route name", () => {
    for (const slug of ["admin", "dashboard", "staff", "order", "t", "m"]) {
      const result = createTenantSchema.safeParse({ ...VALID_BASE, slug });
      expect(result.success, `${slug} should be reserved`).toBe(false);
    }
  });
});

describe("signUpSchema", () => {
  it("accepts an ordinary shop name", () => {
    const result = signUpSchema.safeParse({ ...SIGNUP_BASE, slug: "cha-stall" });
    expect(result.success).toBe(true);
  });

  /** The bypass: these parsed cleanly before the rule was shared. */
  it("rejects a reserved name on the signup path too", () => {
    for (const slug of ["admin", "api", "dashboard", "www"]) {
      const result = signUpSchema.safeParse({ ...SIGNUP_BASE, slug });
      expect(result.success, `${slug} should be reserved at signup`).toBe(false);
    }
  });

  it("still enforces the DNS-label shape", () => {
    for (const slug of ["-leading", "trailing-", "Upper Case", "a"]) {
      expect(signUpSchema.safeParse({ ...SIGNUP_BASE, slug }).success).toBe(false);
    }
  });
});
