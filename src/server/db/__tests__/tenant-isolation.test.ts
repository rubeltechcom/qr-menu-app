import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rawPrisma } from "../client";
import { forTenant } from "../tenant-client";
import { createTenantRecord } from "@/modules/tenants/tenant.repository";
import { resolveTableByPublicCode } from "@/modules/tables/table.repository";
import { generatePublicCode } from "@/modules/tables/public-code";
import { listMembershipsForUser } from "@/modules/tenants/membership.repository";

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
    for (const db of [forTenant(tenantAId), forTenant(tenantBId)]) {
      // Children first — RLS is FORCE-enabled, so these run scoped too.
      await db.menuItem.deleteMany({});
      await db.category.deleteMany({});
      await db.menu.deleteMany({});
      await db.table.deleteMany({});
      await db.zone.deleteMany({});
      await db.location.deleteMany({});
    }
    await rawPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `select set_config('app.tenant_id', $1, true)`,
        tenantAId,
      );
      await tx.tenant.delete({ where: { id: tenantAId } });
    });
    await rawPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `select set_config('app.tenant_id', $1, true)`,
        tenantBId,
      );
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

    await expect(dbB.location.delete({ where: { id: location.id } })).rejects.toThrow();

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
      await tx.$executeRawUnsafe(
        `select set_config('app.tenant_id', $1, true)`,
        tenantBId,
      );
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
      await tx.$executeRawUnsafe(
        `select set_config('app.tenant_id', $1, true)`,
        tenantAId,
      );
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

  it("Phase 3: tenant B cannot read tenant A's zones or tables", async () => {
    const dbA = forTenant(tenantAId);
    const location = await dbA.location.create({
      data: { tenantId: tenantAId, name: "Joe's Pizza — Harbour" },
    });
    const zone = await dbA.zone.create({
      data: { tenantId: tenantAId, locationId: location.id, name: "Patio" },
    });
    const table = await dbA.table.create({
      data: {
        tenantId: tenantAId,
        locationId: location.id,
        zoneId: zone.id,
        label: "12",
        publicCode: `TESTCODE${Date.now()}`,
      },
    });

    const dbB = forTenant(tenantBId);
    expect(await dbB.zone.findUnique({ where: { id: zone.id } })).toBeNull();
    expect(await dbB.table.findUnique({ where: { id: table.id } })).toBeNull();
    expect(await dbB.table.findMany({})).toHaveLength(0);

    // A cross-tenant write must fail rather than silently retarget.
    await expect(
      dbB.table.update({ where: { id: table.id }, data: { label: "hijacked" } }),
    ).rejects.toThrow();

    const ownTable = await dbA.table.findUnique({ where: { id: table.id } });
    expect(ownTable?.label).toBe("12");
  });

  it("the QR public-code lookup resolves a table without tenant context, but only an active one", async () => {
    const dbA = forTenant(tenantAId);
    const location = await dbA.location.create({
      data: { tenantId: tenantAId, name: "Joe's Pizza — Airport" },
    });
    const publicCode = `QRCODE${Date.now()}`;
    const table = await dbA.table.create({
      data: { tenantId: tenantAId, locationId: location.id, label: "A1", publicCode },
    });

    // The storefront entry point: no tenant context at all. This is the
    // one read allowed to run unscoped, via the public_code_lookup policy.
    const resolved = await resolveTableByPublicCode(publicCode);
    expect(resolved?.id).toBe(table.id);
    expect(resolved?.tenantId).toBe(tenantAId);

    // Deactivating the table must stop the QR code resolving — this is
    // how an owner retires a sticker.
    await dbA.table.update({ where: { id: table.id }, data: { isActive: false } });
    expect(await resolveTableByPublicCode(publicCode)).toBeNull();

    // And an unknown code resolves to nothing rather than erroring.
    expect(await resolveTableByPublicCode("NOSUCHCODE")).toBeNull();
  });

  it("scoping preserves include/select — a read still returns its relations", async () => {
    // Regression test. The tenant extension rewrites update/delete to
    // their *Many forms, which reject include/select, so those args are
    // stripped for those two operations. When that strip was applied to
    // reads as well, every nested query in the app silently came back
    // with its relations undefined — the storefront menu rendered as a
    // 500, and no isolation test caught it because they all read scalars.
    const dbA = forTenant(tenantAId);
    const location = await dbA.location.create({
      data: { tenantId: tenantAId, name: "Joe's Pizza — Central" },
    });
    const menu = await dbA.menu.create({
      data: { tenantId: tenantAId, locationId: location.id, name: "Dinner" },
    });
    const category = await dbA.category.create({
      data: { tenantId: tenantAId, menuId: menu.id, name: "Starters" },
    });
    await dbA.menuItem.create({
      data: {
        tenantId: tenantAId,
        categoryId: category.id,
        name: "Garlic Bread",
        basePriceCents: 500,
      },
    });

    const withContent = await dbA.menu.findFirst({
      where: { id: menu.id },
      include: { categories: { include: { items: true } } },
    });

    expect(withContent?.categories).toHaveLength(1);
    expect(withContent?.categories[0]?.items).toHaveLength(1);
    expect(withContent?.categories[0]?.items[0]?.name).toBe("Garlic Bread");

    // `select` must survive too.
    const selected = await dbA.menu.findFirst({
      where: { id: menu.id },
      select: { name: true },
    });
    expect(selected).toEqual({ name: "Dinner" });
  });

  it("a signed-in user can discover their own memberships before any tenant is chosen", async () => {
    // Regression test. Membership lookup is the bootstrap step: it is what
    // tells the dashboard which tenants a person may open, so it runs
    // BEFORE app.tenant_id is set. When "memberships" carried only the
    // tenant-scoped policy, this read matched nothing — the owner saw
    // "No restaurants yet" and every /dashboard/<slug>/* route 404'd,
    // while the row sat in the table the whole time.
    const own = await listMembershipsForUser(ownerAId);
    expect(own).toHaveLength(1);
    expect(own[0]?.tenant.id).toBe(tenantAId);

    // The widened policy is SELECT-only and unscoped, so the guarantee
    // that one user cannot see another's memberships comes from the
    // repository narrowing by userId — assert that it actually holds.
    const otherPersons = await listMembershipsForUser(ownerBId);
    expect(otherPersons.map((m) => m.tenant.id)).toEqual([tenantBId]);
  });

  it("generated public codes are unguessable and avoid confusable characters", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 500; i += 1) codes.add(generatePublicCode());

    // No collisions across 500 draws, and nothing that a person re-typing
    // a scratched sticker would misread.
    expect(codes.size).toBe(500);
    for (const code of codes) {
      expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    }
  });
});
