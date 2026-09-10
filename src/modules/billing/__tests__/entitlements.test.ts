import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rawPrisma } from "@/server/db/client";
import { forTenant } from "@/server/db/tenant-client";
import { createTenantRecord } from "@/modules/tenants/tenant.repository";
import { assertCanCreate, checkLimit, PlanLimitError } from "../entitlements";

/**
 * Limit enforcement against the real database.
 *
 * plans.test.ts covers the arithmetic; this covers the part that
 * actually protects revenue — that the counting query and the limit
 * agree, and that a bulk create is checked as a whole rather than
 * failing halfway and leaving a half-built floor plan.
 */

describe("plan limit enforcement", () => {
  let tenantId: string;
  let ownerId: string;
  let locationId: string;

  const free = { plan: "FREE", subscriptionStatus: "ACTIVE" };
  const pro = { plan: "PRO", subscriptionStatus: "ACTIVE" };

  beforeAll(async () => {
    const stamp = Date.now();
    const owner = await rawPrisma.user.create({
      data: { email: `limit-owner-${stamp}@example.test`, name: "Limit Owner" },
    });
    ownerId = owner.id;

    const tenant = await createTenantRecord({
      name: "Limit Test Diner",
      slug: `limit-test-${stamp}`,
      ownerUserId: ownerId,
      defaultLocale: "en",
      currency: "USD",
    });
    tenantId = tenant.id;

    const db = forTenant(tenantId);
    const location = await db.location.create({
      data: { tenantId, name: "Limit Location" },
    });
    locationId = location.id;
  });

  afterAll(async () => {
    const db = forTenant(tenantId);
    await db.table.deleteMany({});
    await db.location.deleteMany({});
    await rawPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('app.tenant_id', $1, true)`, tenantId);
      await tx.membership.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });
    await rawPrisma.user.delete({ where: { id: ownerId } });
    await rawPrisma.$disconnect();
  });

  it("counts what exists and allows up to the limit", async () => {
    const db = forTenant(tenantId);

    const before = await checkLimit(db, free, "tables");
    expect(before.used).toBe(0);
    expect(before.max).toBe(10);
    expect(before.allowed).toBe(true);

    // Fill to exactly the Free limit. The suffix has to come last and
    // survive any truncation, or every code collides on the unique index.
    const run = Date.now().toString(36).toUpperCase();
    for (let i = 1; i <= 10; i += 1) {
      await db.table.create({
        data: {
          tenantId,
          locationId,
          label: `L${i}`,
          publicCode: `L${run}X${i}`,
        },
      });
    }

    const atLimit = await checkLimit(db, free, "tables");
    expect(atLimit.used).toBe(10);
    expect(atLimit.allowed).toBe(false);

    await expect(assertCanCreate(db, free, "tables")).rejects.toBeInstanceOf(
      PlanLimitError,
    );
  });

  it("checks a bulk create as a whole, before creating anything", async () => {
    const db = forTenant(tenantId);
    // 10 already exist from the test above; asking for 5 more must fail
    // up front rather than creating some and stopping.
    await expect(assertCanCreate(db, free, "tables", 5)).rejects.toThrow(
      /would exceed/i,
    );
    expect(await db.table.count({ where: { deletedAt: null } })).toBe(10);
  });

  it("says which plan to upgrade to", async () => {
    const db = forTenant(tenantId);
    try {
      await assertCanCreate(db, free, "tables");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(PlanLimitError);
      // The message is shown to a restaurant owner, so it has to name
      // the fix rather than just refusing.
      expect((error as PlanLimitError).message).toMatch(/Upgrade to Smart/);
      expect((error as PlanLimitError).limit).toBe("tables");
    }
  });

  it("lets a paid plan straight through", async () => {
    const db = forTenant(tenantId);
    // Same 10 rows, different plan — unlimited means unlimited, not 0.
    await expect(assertCanCreate(db, pro, "tables", 500)).resolves.toBeUndefined();

    const status = await checkLimit(db, pro, "tables");
    expect(status.max).toBeNull();
    expect(status.allowed).toBe(true);
  });

  it("drops a lapsed subscription back to the Free limit", async () => {
    const db = forTenant(tenantId);
    // A cancelled Pro tenant is entitled to Free, so the 10 rows they
    // already have are now at the cap — but nothing was deleted.
    await expect(
      assertCanCreate(db, { plan: "PRO", subscriptionStatus: "CANCELED" }, "tables"),
    ).rejects.toBeInstanceOf(PlanLimitError);

    expect(await db.table.count({ where: { deletedAt: null } })).toBe(10);
  });
});
