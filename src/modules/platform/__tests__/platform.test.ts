import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rawPrisma } from "@/server/db/client";
import { forTenant } from "@/server/db/tenant-client";
import { createTenantRecord } from "@/modules/tenants/tenant.repository";
import { listAllTenants, statsForTenant } from "../platform.repository";

/**
 * The platform admin area is the one place that reads across tenants,
 * so it is also the most dangerous thing in the codebase to get wrong.
 *
 * These tests hold the line in both directions: the superadmin path can
 * see every restaurant, and the policy that makes that possible has not
 * opened a hole for anyone else.
 */

describe("platform admin reads", () => {
  let tenantAId: string;
  let tenantBId: string;
  let ownerAId: string;
  let ownerBId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const ownerA = await rawPrisma.user.create({
      data: { email: `plat-a-${stamp}@example.test`, name: "Plat A" },
    });
    const ownerB = await rawPrisma.user.create({
      data: { email: `plat-b-${stamp}@example.test`, name: "Plat B" },
    });
    ownerAId = ownerA.id;
    ownerBId = ownerB.id;

    const a = await createTenantRecord({
      name: "Platform Test A",
      slug: `plat-a-${stamp}`,
      ownerUserId: ownerAId,
      defaultLocale: "en",
      currency: "USD",
    });
    const b = await createTenantRecord({
      name: "Platform Test B",
      slug: `plat-b-${stamp}`,
      ownerUserId: ownerBId,
      defaultLocale: "en",
      currency: "USD",
    });
    tenantAId = a.id;
    tenantBId = b.id;

    // Give A something to count.
    const dbA = forTenant(tenantAId);
    const location = await dbA.location.create({
      data: { tenantId: tenantAId, name: "A Location" },
    });
    await dbA.table.create({
      data: {
        tenantId: tenantAId,
        locationId: location.id,
        label: "1",
        publicCode: `PLT${stamp}`.slice(0, 12),
      },
    });
  });

  afterAll(async () => {
    for (const tenantId of [tenantAId, tenantBId]) {
      const db = forTenant(tenantId);
      await db.table.deleteMany({});
      await db.location.deleteMany({});
      await rawPrisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `select set_config('app.tenant_id', $1, true)`,
          tenantId,
        );
        await tx.membership.deleteMany({ where: { tenantId } });
        await tx.tenant.delete({ where: { id: tenantId } });
      });
    }
    await rawPrisma.user.deleteMany({ where: { id: { in: [ownerAId, ownerBId] } } });
    await rawPrisma.$disconnect();
  });

  it("lists every tenant for the platform operator", async () => {
    const all = await listAllTenants();
    const ids = all.map((tenant) => tenant.id);

    expect(ids).toContain(tenantAId);
    expect(ids).toContain(tenantBId);
  });

  it("does NOT let an ordinary unscoped read see tenants", async () => {
    // The whole point of the dedicated policy: without the platform GUC
    // set, a plain read still returns nothing. If this ever starts
    // returning rows, the admin policy has been written too broadly and
    // every tenant is visible to every request.
    const rows = await rawPrisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM tenants
    `;
    expect(rows).toHaveLength(0);
  });

  it("does not leak the GUC to the next query on the connection", async () => {
    // set_config(..., true) is transaction-scoped. If it were session
    // -scoped, one admin page load would leave every subsequent request
    // on that pooled connection able to read all tenants.
    await listAllTenants();

    const rows = await rawPrisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM tenants
    `;
    expect(rows).toHaveLength(0);
  });

  it("still scopes per-tenant stats through forTenant", async () => {
    const statsA = await statsForTenant(tenantAId);
    const statsB = await statsForTenant(tenantBId);

    // A's table must not be counted against B.
    expect(statsA.tables).toBe(1);
    expect(statsA.locations).toBe(1);
    expect(statsB.tables).toBe(0);
    expect(statsB.locations).toBe(0);
  });

  it("keeps the admin policy read-only", async () => {
    // The policy is FOR SELECT, so an UPDATE with only the platform GUC
    // set matches no rows. Postgres does not error here — it simply
    // finds nothing to update, which is the outcome that matters: an
    // operator can look at everything and change nothing this way.
    const affected = await rawPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('app.platform_admin', 'on', true)`);
      return tx.$executeRawUnsafe(
        `UPDATE tenants SET name = 'hijacked' WHERE id = $1`,
        tenantAId,
      );
    });

    expect(affected).toBe(0);

    const all = await listAllTenants();
    expect(all.find((tenant) => tenant.id === tenantAId)?.name).toBe("Platform Test A");
  });

  it("scopes the bootstrap lookup to the requesting user", async () => {
    // Regression test for a gap the admin panel exposed: the
    // membership bootstrap policy used to let ANY unscoped session read
    // every membership, and every tenant that had one. It is now keyed
    // on app.user_id, so owner A sees only A.
    const asOwnerA = await rawPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('app.user_id', $1, true)`, ownerAId);
      return tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM tenants`);
    });

    const visible = asOwnerA.map((row) => row.id);
    expect(visible).toContain(tenantAId);
    expect(visible).not.toContain(tenantBId);
  });
});
