import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rawPrisma } from "@/server/db/client";
import { forTenant } from "@/server/db/tenant-client";
import { createTenantRecord } from "@/modules/tenants/tenant.repository";
import { runWithTenant } from "@/server/tenant-context";
import * as menuService from "../menu.service";

/**
 * The menu service against the real database.
 *
 * The case that matters most here is the one that shipped broken: the
 * service resolves its own tenant-scoped client from AsyncLocalStorage,
 * so a caller that has left that store gets "No tenant context
 * available" instead of a saved dish. Server Actions await an auth check
 * before calling a service, and that await is exactly where the store
 * used to be lost — hence requireDashboardTenant's `withTenant`, and
 * hence the first test below.
 */

describe("menu service", () => {
  let tenantId: string;
  let categoryId: string;
  let menuId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const owner = await rawPrisma.user.create({
      data: { email: `menu-owner-${stamp}@example.test`, name: "Menu Owner" },
    });

    const tenant = await createTenantRecord({
      name: "Menu Test Diner",
      slug: `menu-test-${stamp}`,
      ownerUserId: owner.id,
      defaultLocale: "en",
      currency: "USD",
    });
    tenantId = tenant.id;

    const db = forTenant(tenantId);
    const location = await db.location.create({
      data: { tenantId, name: "Test Location", timezone: "UTC" },
    });
    const menu = await db.menu.create({
      data: { tenantId, locationId: location.id, name: "Test Menu" },
    });
    menuId = menu.id;
    const category = await db.category.create({
      data: { tenantId, menuId: menu.id, name: "Mains" },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await rawPrisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  /** What a Server Action does: authenticate, then call the service. */
  const asAction = <T>(fn: () => Promise<T>) => runWithTenant(tenantId, "menu-test", fn);

  it("refuses to run outside a tenant context rather than querying unscoped", async () => {
    await expect(
      menuService.createMenuItem({ categoryId, name: "Nope", basePriceCents: 100 }),
    ).rejects.toThrow(/no tenant context/i);
  });

  it("creates a dish when called the way a Server Action calls it", async () => {
    // The regression: an action awaits its auth check first, and the
    // context must still be present by the time the service runs.
    const item = await asAction(async () => {
      await Promise.resolve(); // stand-in for the awaited auth check
      return menuService.createMenuItem({
        categoryId,
        name: "Chicken katsu curry",
        description: "Panko-breaded chicken",
        basePriceCents: 895,
        dietaryTags: ["Popular"],
      });
    });

    expect(item.name).toBe("Chicken katsu curry");
    expect(item.basePriceCents).toBe(895);
    expect(item.tenantId).toBe(tenantId);
  });

  it("stores a category icon and reads it back", async () => {
    const category = await asAction(() =>
      menuService.createCategory({ menuId, name: "Desserts", icon: "🍰" }),
    );
    expect(category.icon).toBe("🍰");

    const updated = await asAction(() =>
      menuService.updateCategory(category.id, { name: "Desserts", icon: "🍡" }),
    );
    expect(updated.icon).toBe("🍡");
  });

  it("leaves the icon null when none is chosen, so the storefront can guess", async () => {
    const category = await asAction(() =>
      menuService.createCategory({ menuId, name: "Drinks" }),
    );
    expect(category.icon).toBeNull();
  });

  it("rejects an image URL that is not one of this tenant's uploads", async () => {
    // Someone pasting another restaurant's photo, or an arbitrary
    // external URL, must not end up stored on a menu item.
    await expect(
      asAction(() =>
        menuService.createMenuItem({
          categoryId,
          name: "Hotlinked",
          basePriceCents: 500,
          images: ["https://example.com/someone-elses-photo.jpg"],
        }),
      ),
    ).rejects.toThrow(/isn't one of your uploads/i);

    await expect(
      asAction(() =>
        menuService.createMenuItem({
          categoryId,
          name: "Other tenant",
          basePriceCents: 500,
          images: ["/api/uploads/t/clxsomeoneelse/menuItem/2026/09/abc123.jpg"],
        }),
      ),
    ).rejects.toThrow(/isn't one of your uploads/i);
  });

  it("accepts an image this tenant uploaded", async () => {
    const item = await asAction(() =>
      menuService.createMenuItem({
        categoryId,
        name: "With a photo",
        basePriceCents: 500,
        images: [`/api/uploads/t/${tenantId}/menuItem/2026/09/abc123.jpg`],
      }),
    );
    expect(item.images).toHaveLength(1);
  });
});
