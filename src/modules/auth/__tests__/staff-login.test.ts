import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rawPrisma } from "@/server/db/client";
import { createTenantRecord } from "@/modules/tenants/tenant.repository";
import { setStaffPin, verifyStaffPin } from "../staff-pin.service";
import {
  findTenantForStaffLogin,
  listStaffPinsForTenant,
} from "../staff-login.repository";

/**
 * Staff PIN login, against the real database — because the thing that
 * broke here was row-level security, which no amount of mocking would
 * have caught.
 *
 * Staff sign in with a restaurant slug and a PIN, holding no session and
 * having selected no tenant. Both reads that requires are blocked by the
 * ordinary RLS policies, so they go through a deliberately narrow
 * staff-login window instead. These tests pin that window open at the
 * right width: wide enough to log in, narrow enough that one restaurant
 * cannot see another's staff.
 */

describe("staff login", () => {
  let tenantId: string;
  let otherTenantId: string;
  let slug: string;
  let membershipId: string;
  const PIN = "4821";

  beforeAll(async () => {
    const stamp = Date.now();

    const owner = await rawPrisma.user.create({
      data: { email: `staff-owner-${stamp}@example.test`, name: "Owner" },
    });
    const tenant = await createTenantRecord({
      name: "Staff Test Diner",
      slug: `staff-test-${stamp}`,
      ownerUserId: owner.id,
      defaultLocale: "en",
      currency: "USD",
    });
    tenantId = tenant.id;
    slug = tenant.slug;

    const cook = await rawPrisma.user.create({
      data: { email: `staff-cook-${stamp}@example.test`, name: "Sam Cook" },
    });
    // Writing a membership needs the tenant context RLS expects — the
    // same isolation that makes the staff-login window necessary.
    const membership = await rawPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `select set_config('app.tenant_id', $1, true)`,
        tenantId,
      );
      return tx.membership.create({
        data: { tenantId, userId: cook.id, role: "KITCHEN" },
      });
    });
    membershipId = membership.id;
    await setStaffPin(membershipId, PIN);

    // A second restaurant, to prove one cannot reach the other's staff.
    const otherOwner = await rawPrisma.user.create({
      data: { email: `staff-other-${stamp}@example.test`, name: "Other" },
    });
    const other = await createTenantRecord({
      name: "Other Diner",
      slug: `staff-other-${stamp}`,
      ownerUserId: otherOwner.id,
      defaultLocale: "en",
      currency: "USD",
    });
    otherTenantId = other.id;
  });

  afterAll(async () => {
    await rawPrisma.staffPin.deleteMany({ where: { membershipId } });
    for (const id of [tenantId, otherTenantId]) {
      await rawPrisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`select set_config('app.tenant_id', $1, true)`, id);
        await tx.membership.deleteMany({ where: { tenantId: id } });
      });
      await rawPrisma.tenant.deleteMany({ where: { id } });
    }
  });

  it("finds a restaurant by its slug with no session at all", async () => {
    // The regression: RLS hid every tenant row from the PIN screen, so
    // a perfectly correct slug came back "restaurant not found".
    const tenant = await findTenantForStaffLogin(slug);
    expect(tenant?.id).toBe(tenantId);
  });

  it("returns nothing for a slug that does not exist", async () => {
    await expect(findTenantForStaffLogin("no-such-restaurant")).resolves.toBeNull();
  });

  it("verifies a correct PIN and reports who signed in", async () => {
    const result = await verifyStaffPin(tenantId, PIN);
    expect(result).not.toBeNull();
    expect(result?.membershipId).toBe(membershipId);
    expect(result?.tenantId).toBe(tenantId);
    expect(result?.role).toBe("KITCHEN");
    expect(result?.name).toBe("Sam Cook");
  });

  it("rejects a wrong PIN", async () => {
    await expect(verifyStaffPin(tenantId, "0000")).resolves.toBeNull();
  });

  it("rejects a PIN that is not 4-6 digits", async () => {
    await expect(verifyStaffPin(tenantId, "12")).resolves.toBeNull();
    await expect(verifyStaffPin(tenantId, "abcd")).resolves.toBeNull();
  });

  it("will not accept one restaurant's PIN at another restaurant", async () => {
    // The whole point of scoping the window to a single tenant: a PIN is
    // only 4 digits, so collisions between restaurants are inevitable.
    await expect(verifyStaffPin(otherTenantId, PIN)).resolves.toBeNull();
  });

  it("exposes only the named restaurant's staff, never another's", async () => {
    const mine = await listStaffPinsForTenant(tenantId);
    expect(mine).toHaveLength(1);

    const theirs = await listStaffPinsForTenant(otherTenantId);
    expect(theirs).toHaveLength(0);
  });
});
