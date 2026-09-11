import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rawPrisma } from "@/server/db/client";
import { forTenant } from "@/server/db/tenant-client";
import { createTenantRecord } from "@/modules/tenants/tenant.repository";
import {
  listAllTranslationsForEntities,
  listTranslationsForEntities,
  saveTranslation,
} from "../translation.repository";

/**
 * Menu-content translations, against the real database.
 *
 * Two properties matter here and neither can be checked without
 * Postgres: clearing a translation must delete the row rather than
 * store an empty string (an empty dish name would render as a blank on
 * a live menu), and one restaurant must never be able to read another's
 * translations — the same RLS guarantee every other table has.
 */

describe("translation repository", () => {
  let tenantId: string;
  let otherTenantId: string;
  let itemId: string;

  beforeAll(async () => {
    const stamp = Date.now();

    const owner = await rawPrisma.user.create({
      data: { email: `tr-owner-${stamp}@example.test`, name: "Translation Owner" },
    });
    const tenant = await createTenantRecord({
      name: "Translation Diner",
      slug: `tr-test-${stamp}`,
      ownerUserId: owner.id,
      defaultLocale: "en",
      currency: "USD",
    });
    tenantId = tenant.id;

    const otherOwner = await rawPrisma.user.create({
      data: { email: `tr-other-${stamp}@example.test`, name: "Other Owner" },
    });
    const other = await createTenantRecord({
      name: "Other Diner",
      slug: `tr-other-${stamp}`,
      ownerUserId: otherOwner.id,
      defaultLocale: "en",
      currency: "USD",
    });
    otherTenantId = other.id;

    const db = forTenant(tenantId);
    const location = await db.location.create({
      data: { tenantId, name: "Loc", timezone: "UTC" },
    });
    const menu = await db.menu.create({
      data: { tenantId, locationId: location.id, name: "Menu" },
    });
    const category = await db.category.create({
      data: { tenantId, menuId: menu.id, name: "Mains" },
    });
    const item = await db.menuItem.create({
      data: {
        tenantId,
        categoryId: category.id,
        name: "Chicken Biryani",
        basePriceCents: 1200,
      },
    });
    itemId = item.id;
  });

  afterAll(async () => {
    await rawPrisma.$executeRawUnsafe(
      `DELETE FROM translations WHERE "tenantId" IN ('${tenantId}', '${otherTenantId}')`,
    );
  });

  it("saves and reads back a translation", async () => {
    const db = forTenant(tenantId);
    await saveTranslation(db, tenantId, {
      entityType: "menuItem",
      entityId: itemId,
      field: "name",
      locale: "bn",
      value: "চিকেন বিরিয়ানি",
    });

    const rows = await listTranslationsForEntities(db, [itemId], "bn");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("চিকেন বিরিয়ানি");
  });

  it("overwrites rather than duplicating on a second save", async () => {
    const db = forTenant(tenantId);
    await saveTranslation(db, tenantId, {
      entityType: "menuItem",
      entityId: itemId,
      field: "name",
      locale: "bn",
      value: "মুরগির বিরিয়ানি",
    });

    const rows = await listTranslationsForEntities(db, [itemId], "bn");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("মুরগির বিরিয়ানি");
  });

  it("deletes the row when the value is cleared", async () => {
    // Not an empty string: the storefront falls back to the original
    // only when the row is absent, so a blank would blank the dish.
    const db = forTenant(tenantId);
    await saveTranslation(db, tenantId, {
      entityType: "menuItem",
      entityId: itemId,
      field: "name",
      locale: "bn",
      value: "   ",
    });

    expect(await listTranslationsForEntities(db, [itemId], "bn")).toHaveLength(0);
  });

  it("returns nothing for a locale with no translations", async () => {
    const db = forTenant(tenantId);
    await saveTranslation(db, tenantId, {
      entityType: "menuItem",
      entityId: itemId,
      field: "name",
      locale: "bn",
      value: "বিরিয়ানি",
    });

    expect(await listTranslationsForEntities(db, [itemId], "en")).toHaveLength(0);
  });

  it("does not leak one restaurant's translations to another", async () => {
    const otherDb = forTenant(otherTenantId);

    // The id is guessable in principle; RLS is what stops the read.
    expect(await listAllTranslationsForEntities(otherDb, [itemId])).toHaveLength(0);
  });

  it("returns an empty list without querying for no ids", async () => {
    const db = forTenant(tenantId);
    expect(await listTranslationsForEntities(db, [], "bn")).toEqual([]);
    expect(await listAllTranslationsForEntities(db, [])).toEqual([]);
  });
});
