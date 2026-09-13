import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rawPrisma } from "@/server/db/client";
import { createTenantRecord } from "../tenant.repository";
import { resolveTenantBySlug } from "../storefront.repository";

/**
 * The RLS window that lets a shop's own link resolve.
 *
 * A shopper at /<slug> has no account and no tenant context, so the
 * lookup runs outside every ordinary policy on "tenants". Migration
 * 20260913060000 opened a window for it and 20260913061000 pinned that
 * window to one row — this suite is what holds the pin in place.
 *
 * The first version of the policy gated only on a boolean GUC. It
 * worked, and `select slug from tenants` inside the window returned all
 * 176 rows on a development machine. Application code never enumerated,
 * because it only ever queries by slug; the policy allowed it anyway.
 * That is the difference this suite exists to keep measuring — not
 * "does the feature work", which a single happy-path test would cover,
 * but "can the window be used for anything other than what it is for".
 */

const STAMP = Date.now();
const SHOP_SLUG = `shop-lookup-${STAMP}`;
const OTHER_SLUG = `shop-other-${STAMP}`;

/** Opens the window by hand, to probe it with queries the app never makes. */
function inWindow<T>(
  slug: string,
  fn: (tx: Parameters<Parameters<typeof rawPrisma.$transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return rawPrisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`select set_config('app.storefront_lookup', 'on', true)`);
    await tx.$executeRawUnsafe(`select set_config('app.storefront_slug', $1, true)`, slug);
    return fn(tx);
  });
}

let shopId: string;
let otherId: string;
let ownerId: string;
let closedId: string;

beforeAll(async () => {
  const owner = await rawPrisma.user.create({
    data: { email: `shop-owner-${STAMP}@example.test`, name: "Shop Owner" },
  });
  ownerId = owner.id;

  const shop = await createTenantRecord({
    name: "Rubel Furniture",
    slug: SHOP_SLUG,
    ownerUserId: ownerId,
    defaultLocale: "en",
    currency: "USD",
  });
  shopId = shop.id;

  const other = await createTenantRecord({
    name: "Someone Else",
    slug: OTHER_SLUG,
    ownerUserId: ownerId,
    defaultLocale: "en",
    currency: "USD",
  });
  otherId = other.id;

  const closed = await createTenantRecord({
    name: "Closed Shop",
    slug: `shop-closed-${STAMP}`,
    ownerUserId: ownerId,
    defaultLocale: "en",
    currency: "USD",
  });
  closedId = closed.id;
  // Soft-delete it through the tenant's own context, as the app would.
  await rawPrisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`select set_config('app.tenant_id', $1, true)`, closedId);
    await tx.tenant.updateMany({
      where: { id: closedId },
      data: { deletedAt: new Date() },
    });
  });
});

afterAll(async () => {
  // FORCE RLS applies to the table owner too, so each delete runs inside
  // its own tenant's context.
  for (const id of [shopId, otherId, closedId]) {
    await rawPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('app.tenant_id', $1, true)`, id);
      await tx.membership.deleteMany({ where: { tenantId: id } });
      await tx.tenant.deleteMany({ where: { id } });
    });
  }
  await rawPrisma.user.deleteMany({ where: { id: ownerId } });
  await rawPrisma.$disconnect();
});

describe("resolveTenantBySlug", () => {
  it("resolves a shop from its own slug, with no tenant context", async () => {
    const shop = await resolveTenantBySlug(SHOP_SLUG);
    expect(shop).not.toBeNull();
    expect(shop?.id).toBe(shopId);
    expect(shop?.name).toBe("Rubel Furniture");
  });

  it("returns null for a slug nobody owns", async () => {
    expect(await resolveTenantBySlug(`no-such-shop-${STAMP}`)).toBeNull();
  });

  it("returns null for a closed shop, so its link dies with it", async () => {
    expect(await resolveTenantBySlug(`shop-closed-${STAMP}`)).toBeNull();
  });
});

describe("the storefront lookup window", () => {
  it("admits nothing at all without the GUCs", async () => {
    const row = await rawPrisma.tenant.findFirst({
      where: { slug: SHOP_SLUG },
      select: { slug: true },
    });
    expect(row).toBeNull();
  });

  /**
   * The regression this file is really for. Before the pin migration
   * this returned every tenant in the database.
   */
  it("admits exactly one row, not the whole table", async () => {
    const rows = await inWindow(SHOP_SLUG, (tx) =>
      tx.tenant.findMany({ select: { slug: true } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.slug).toBe(SHOP_SLUG);
  });

  it("cannot read a different shop than the one it was opened for", async () => {
    const row = await inWindow(SHOP_SLUG, (tx) =>
      tx.tenant.findFirst({ where: { slug: OTHER_SLUG }, select: { slug: true } }),
    );
    expect(row).toBeNull();
  });

  it("admits nothing when the flag is set but no slug is", async () => {
    const rows = await rawPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `select set_config('app.storefront_lookup', 'on', true)`,
      );
      return tx.tenant.findMany({ select: { slug: true } });
    });
    expect(rows).toHaveLength(0);
  });

  /**
   * The policy is FOR SELECT, so a write inside the window matches no
   * row rather than raising: Postgres reports zero rows affected, which
   * is the quieter and stronger outcome — there is nothing to update
   * because the row is not visible to an UPDATE at all.
   */
  it("grants no write access", async () => {
    const result = await inWindow(SHOP_SLUG, (tx) =>
      tx.tenant.updateMany({ where: { slug: SHOP_SLUG }, data: { name: "Hijacked" } }),
    );
    expect(result.count).toBe(0);

    const shop = await resolveTenantBySlug(SHOP_SLUG);
    expect(shop?.name).toBe("Rubel Furniture");
  });
});
