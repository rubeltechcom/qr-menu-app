import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rawPrisma } from "../client";
import { forTenant } from "../tenant-client";
import { createTenantRecord } from "@/modules/tenants/tenant.repository";

/**
 * The tenant-isolation gate required by PROMPT.md §3.1.
 *
 * For every tenant-scoped model, this suite creates two tenants, writes a
 * row under tenant A, and asserts that a client scoped to tenant B cannot
 * read, update, or delete it — via BOTH defenses:
 *   1. The Prisma extension's automatic query filtering (application code
 *      that "forgets" nothing).
 *   2. Postgres Row-Level Security directly (application code that HAS a
 *      bug and queries the raw client without going through forTenant()).
 *
 * This must pass in CI before any tenant-scoped feature ships.
 */

describe("tenant isolation", () => {
  let tenantAId: string;
  let tenantBId: string;
  let ownerAId: string;
  let ownerBId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const ownerA = await rawPrisma.user.create({
      data: { email: `owner-a-${stamp}@example.test`, name: "Owner A" },
    });
    const ownerB = await rawPrisma.user.create({
      data: { email: `owner-b-${stamp}@example.test`, name: "Owner B" },
    });
    ownerAId = ownerA.id;
    ownerBId = ownerB.id;

    // Go through the real creation path (see tenant.repository.ts) so
    // this test exercises the same RLS-under-FORCE code path production
    // signups use, rather than a raw insert that predates the fix.
    const tenantA = await createTenantRecord({
      name: "Tenant A",
      slug: `tenant-a-${stamp}`,
      ownerUserId: ownerAId,
      defaultLocale: "en",
      currency: "USD",
    });
    const tenantB = await createTenantRecord({
      name: "Tenant B",
      slug: `tenant-b-${stamp}`,
      ownerUserId: ownerBId,
      defaultLocale: "en",
      currency: "USD",
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;
  });

  afterAll(async () => {
    // Direct raw-client cleanup — RLS is FORCE-enabled even for the table
    // owner, so cleanup must happen with the tenant context set, same as
    // any other write. Each set_config + statement pair is wrapped in
    // one $transaction so both run on the same physical connection —
    // see the CRITICAL comment in tenant-client.ts for why a bare
    // sequential await pair is unsafe under a connection pool.
    const dbA = forTenant(tenantAId);
    await dbA.location.deleteMany({});
    const dbB = forTenant(tenantBId);
    await dbB.location.deleteMany({});
    await rawPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('app.tenant_id', $1, true)`, tenantAId);
      await tx.tenant.delete({ where: { id: tenantAId } });
    });
    await rawPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('app.tenant_id', $1, true)`, tenantBId);
      await tx.tenant.delete({ where: { id: tenantBId } });
    });
    await rawPrisma.user.deleteMany({ where: { id: { in: [ownerAId, ownerBId] } } });
    await rawPrisma.$disconnect();
  });

  it("Prisma extension: tenant B cannot read tenant A's locations", async () => {
    const dbA = forTenant(tenantAId);
    const location = await dbA.location.create({
      data: { tenantId: tenantAId, name: "Joe's Pizza — Main St" },
    });

    const dbB = forTenant(tenantBId);
    const fromB = await dbB.location.findUnique({ where: { id: location.id } });
    expect(fromB).toBeNull();

    const listFromB = await dbB.location.findMany({});
    expect(listFromB).toHaveLength(0);
  });

  it("Prisma extension: tenant B cannot update or delete tenant A's location", async () => {
    const dbA = forTenant(tenantAId);
    const location = await dbA.location.create({
      data: { tenantId: tenantAId, name: "Joe's Pizza — Uptown" },
    });

    const dbB = forTenant(tenantBId);
    await expect(
      dbB.location.update({
        where: { id: location.id },
        data: { name: "Hijacked" },
      }),
    ).rejects.toThrow();

    await expect(
      dbB.location.delete({ where: { id: location.id } }),
    ).rejects.toThrow();

    const stillThere = await dbA.location.findUnique({ where: { id: location.id } });
    expect(stillThere?.name).toBe("Joe's Pizza — Uptown");
  });

  it("Row-Level Security: a raw query scoped to tenant B's session cannot see tenant A's row even bypassing the Prisma extension", async () => {
    const dbA = forTenant(tenantAId);
    const location = await dbA.location.create({
      data: { tenantId: tenantAId, name: "Joe's Pizza — Riverside" },
    });

    // Simulate a developer bug: querying the RAW client directly (no
    // Prisma-extension filter) but with tenant B's session context set.
    // RLS alone must still block this. set_config + the query are
    // wrapped in one $transaction so both share a connection — see the
    // CRITICAL comment in tenant-client.ts.
    const rows = await rawPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('app.tenant_id', $1, true)`, tenantBId);
      return tx.$queryRawUnsafe<Array<{ id: string }>>(
        `select id from locations where id = $1`,
        location.id,
      );
    });
    expect(rows).toHaveLength(0);

    // Sanity check: the same raw query DOES see the row when scoped to
    // the correct tenant, proving the empty result above is RLS denying
    // access — not, say, a typo in the query.
    const rowsForOwner = await rawPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('app.tenant_id', $1, true)`, tenantAId);
      return tx.$queryRawUnsafe<Array<{ id: string }>>(
        `select id from locations where id = $1`,
        location.id,
      );
    });
    expect(rowsForOwner).toHaveLength(1);
  });

  it("a tenant cannot read another tenant's own record from the tenants table", async () => {
    const dbA = forTenant(tenantAId);
    const seenFromA = await dbA.tenant.findUnique({ where: { id: tenantBId } });
    expect(seenFromA).toBeNull();

    const ownRecord = await dbA.tenant.findUnique({ where: { id: tenantAId } });
    expect(ownRecord?.id).toBe(tenantAId);
  });

  it("forTenant() refuses to build a client without a tenantId", () => {
    expect(() => forTenant("")).toThrow();
  });

  it("Phase 2: tenant B cannot read tenant A's menus, categories, or items", async () => {
    const dbA = forTenant(tenantAId);
    const location = await dbA.location.create({
      data: { tenantId: tenantAId, name: "Joe's Pizza — Downtown" },
    });
    const menu = await dbA.menu.create({
      data: { tenantId: tenantAId, locationId: location.id, name: "Main Menu" },
    });
    const category = await dbA.category.create({
      data: { tenantId: tenantAId, menuId: menu.id, name: "Pizzas" },
    });
    const item = await dbA.menuItem.create({
      data: {
        tenantId: tenantAId,
        categoryId: category.id,
        name: "Margherita",
        basePriceCents: 1200,
      },
    });

    const dbB = forTenant(tenantBId);
    expect(await dbB.menu.findUnique({ where: { id: menu.id } })).toBeNull();
    expect(await dbB.category.findUnique({ where: { id: category.id } })).toBeNull();
    expect(await dbB.menuItem.findUnique({ where: { id: item.id } })).toBeNull();
    expect(await dbB.menuItem.findMany({})).toHaveLength(0);

    // Sanity check: tenant A can still see its own data through the
    // same scoped client.
    const ownItem = await dbA.menuItem.findUnique({ where: { id: item.id } });
    expect(ownItem?.name).toBe("Margherita");
  });
});
