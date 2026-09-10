import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rawPrisma } from "@/server/db/client";
import { forTenant } from "@/server/db/tenant-client";
import { createTenantRecord } from "@/modules/tenants/tenant.repository";
import { businessDateFor } from "../order-number";
import { runWithTenant } from "@/server/tenant-context";
import {
  OrderError,
  placeOrder,
  rejectMyOrder,
  trackOrder,
  transitionMyOrder,
} from "../order.service";
import { DELIVERY_FEE_CENTS } from "../order.schema";

/**
 * Ordering, exercised against the real database — the parts that would
 * cost a restaurant money if they broke: order numbering under
 * concurrency, and prices being taken from the database rather than the
 * request.
 */

describe("orders", () => {
  let tenantId: string;
  let ownerId: string;
  let locationId: string;
  let publicCode: string;
  let ramenId: string;
  let sodaId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const owner = await rawPrisma.user.create({
      data: { email: `order-owner-${stamp}@example.test`, name: "Order Owner" },
    });
    ownerId = owner.id;

    const tenant = await createTenantRecord({
      name: "Order Test Diner",
      slug: `order-test-${stamp}`,
      ownerUserId: ownerId,
      defaultLocale: "en",
      currency: "USD",
    });
    tenantId = tenant.id;

    const db = forTenant(tenantId);
    const location = await db.location.create({
      data: { tenantId, name: "Test Location", timezone: "Asia/Dhaka" },
    });
    locationId = location.id;

    const table = await db.table.create({
      data: {
        tenantId,
        locationId,
        label: "7",
        publicCode: `ORD${stamp}`.slice(0, 12),
      },
    });
    publicCode = table.publicCode;

    const menu = await db.menu.create({
      data: { tenantId, locationId, name: "Test Menu" },
    });
    const category = await db.category.create({
      data: { tenantId, menuId: menu.id, name: "Mains" },
    });
    const ramen = await db.menuItem.create({
      data: { tenantId, categoryId: category.id, name: "Ramen", basePriceCents: 895 },
    });
    const soda = await db.menuItem.create({
      data: { tenantId, categoryId: category.id, name: "Soda", basePriceCents: 250 },
    });
    ramenId = ramen.id;
    sodaId = soda.id;
  });

  afterAll(async () => {
    const db = forTenant(tenantId);
    await db.orderEvent.deleteMany({});
    await db.orderItem.deleteMany({});
    await db.order.deleteMany({});
    await db.orderCounter.deleteMany({});
    await db.table.deleteMany({});
    await db.menuItem.deleteMany({});
    await db.category.deleteMany({});
    await db.menu.deleteMany({});
    await db.location.deleteMany({});
    await rawPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('app.tenant_id', $1, true)`, tenantId);
      await tx.membership.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });
    await rawPrisma.user.delete({ where: { id: ownerId } });
    await rawPrisma.$disconnect();
  });

  describe("staff transitions", () => {
    /** What a Server Action does: authenticate, then call the service. */
    const asAction = <T>(fn: () => Promise<T>) => runWithTenant(tenantId, "order-test", fn);

    async function freshOrder() {
      const { order } = await placeOrder({
        publicCode,
        type: "DINE_IN",
        tableId: "the QR code decides the table",
        items: [{ menuItemId: ramenId, quantity: 1 }],
      });
      return order;
    }

    it("refuses to run outside a tenant context rather than querying unscoped", async () => {
      const order = await freshOrder();
      await expect(
        transitionMyOrder({ orderId: order.id, status: "ACCEPTED" }),
      ).rejects.toThrow(/no tenant context/i);
    });

    it("accepts and readies an order the way a Server Action calls it", async () => {
      // The regression: the board's buttons awaited an auth check before
      // calling the service, which lost the context — so every tap
      // silently reverted and looked like a dead button.
      const order = await freshOrder();

      const accepted = await asAction(async () => {
        await Promise.resolve(); // stand-in for the awaited auth check
        return transitionMyOrder({ orderId: order.id, status: "ACCEPTED" });
      });
      expect(accepted.status).toBe("ACCEPTED");

      const ready = await asAction(() =>
        transitionMyOrder({ orderId: order.id, status: "READY" }),
      );
      expect(ready.status).toBe("READY");

      const completed = await asAction(() =>
        transitionMyOrder({ orderId: order.id, status: "COMPLETED" }),
      );
      expect(completed.status).toBe("COMPLETED");
    });

    it("records the reason a rejected order was turned away", async () => {
      const order = await freshOrder();

      const rejected = await asAction(() =>
        rejectMyOrder(order.id, { reason: "Item sold out" }),
      );
      expect(rejected.status).toBe("REJECTED");
      // Shown to the guest on their tracking page, so it has to persist.
      expect(rejected.rejectionReason).toBe("Item sold out");
    });

    it("refuses to re-transition an order that is already finished", async () => {
      const order = await freshOrder();
      await asAction(() => rejectMyOrder(order.id, { reason: "Closing soon" }));

      // Rewriting a resolved order would quietly change history the
      // guest and the kitchen have both already seen.
      await expect(
        asAction(() => transitionMyOrder({ orderId: order.id, status: "ACCEPTED" })),
      ).rejects.toThrow(/already rejected/i);
    });
  });

  it("prices the order from the database, not from the request", async () => {
    const { order } = await placeOrder({
      publicCode,
      type: "DINE_IN",
      tableId: "ignored — the QR code decides the table",
      items: [{ menuItemId: ramenId, quantity: 2 }],
    });

    // 2 x 895, regardless of anything a tampered client might send.
    expect(order.subtotalCents).toBe(1790);
    expect(order.totalCents).toBe(1790);
    expect(order.items[0]?.unitPriceCents).toBe(895);
    // The line snapshots the name so a later rename cannot rewrite it.
    expect(order.items[0]?.nameSnapshot).toBe("Ramen");
  });

  it("seats a dine-in order at the table the diner picked", async () => {
    // People move seats between scanning and ordering, so the picker's
    // choice wins — as long as it is a table in the same location.
    const db = forTenant(tenantId);
    const moved = await db.table.create({
      data: {
        tenantId,
        locationId,
        label: "9",
        publicCode: `MOV${Date.now()}`.slice(0, 12),
      },
    });

    const { order } = await placeOrder({
      publicCode,
      type: "DINE_IN",
      tableId: moved.id,
      items: [{ menuItemId: ramenId, quantity: 1 }],
    });

    expect(order.tableId).toBe(moved.id);
  });

  it("falls back to the scanned table when the picked one is unknown", async () => {
    const scanned = await forTenant(tenantId).table.findFirst({
      where: { publicCode },
      select: { id: true },
    });

    const { order } = await placeOrder({
      publicCode,
      type: "DINE_IN",
      tableId: "not-a-real-table-id",
      items: [{ menuItemId: ramenId, quantity: 1 }],
    });

    expect(order.tableId).toBe(scanned?.id);
  });

  it("refuses an item that belongs to another tenant", async () => {
    const stamp = Date.now();
    const otherOwner = await rawPrisma.user.create({
      data: { email: `other-${stamp}@example.test`, name: "Other" },
    });
    const otherTenant = await createTenantRecord({
      name: "Other Diner",
      slug: `other-diner-${stamp}`,
      ownerUserId: otherOwner.id,
      defaultLocale: "en",
      currency: "USD",
    });
    const otherDb = forTenant(otherTenant.id);
    const otherLocation = await otherDb.location.create({
      data: { tenantId: otherTenant.id, name: "Other Location" },
    });
    const otherMenu = await otherDb.menu.create({
      data: { tenantId: otherTenant.id, locationId: otherLocation.id, name: "Other Menu" },
    });
    const otherCategory = await otherDb.category.create({
      data: { tenantId: otherTenant.id, menuId: otherMenu.id, name: "Other" },
    });
    const otherItem = await otherDb.menuItem.create({
      data: {
        tenantId: otherTenant.id,
        categoryId: otherCategory.id,
        name: "Not Yours",
        basePriceCents: 1,
      },
    });

    // Ordering another restaurant's dish through this table's QR code
    // must fail outright — not quietly succeed at their price.
    await expect(
      placeOrder({
        publicCode,
        type: "DINE_IN",
        tableId: "x",
        items: [{ menuItemId: otherItem.id, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(OrderError);

    await otherDb.menuItem.deleteMany({});
    await otherDb.category.deleteMany({});
    await otherDb.menu.deleteMany({});
    await otherDb.location.deleteMany({});
    await rawPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `select set_config('app.tenant_id', $1, true)`,
        otherTenant.id,
      );
      await tx.membership.deleteMany({ where: { tenantId: otherTenant.id } });
      await tx.tenant.delete({ where: { id: otherTenant.id } });
    });
    await rawPrisma.user.delete({ where: { id: otherOwner.id } });
  });

  it("refuses an unavailable item", async () => {
    const db = forTenant(tenantId);
    await db.menuItem.update({ where: { id: sodaId }, data: { isAvailable: false } });

    await expect(
      placeOrder({
        publicCode,
        type: "DINE_IN",
        tableId: "x",
        items: [{ menuItemId: sodaId, quantity: 1 }],
      }),
    ).rejects.toThrow(/not available/i);

    await db.menuItem.update({ where: { id: sodaId }, data: { isAvailable: true } });
  });

  it("gives concurrent orders distinct sequential numbers", async () => {
    // The failure this guards against is two diners tapping ORDER at the
    // same moment and both getting "order 12" — the kitchen then has two
    // tickets with one number and no way to tell them apart.
    const placements = await Promise.all(
      Array.from({ length: 8 }, () =>
        placeOrder({
          publicCode,
          type: "DINE_IN",
          tableId: "x",
          items: [{ menuItemId: ramenId, quantity: 1 }],
        }),
      ),
    );

    const numbers = placements.map((result) => result.order.orderNumber);
    expect(new Set(numbers).size).toBe(numbers.length);

    // And they are a contiguous run, not scattered.
    const sorted = [...numbers].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]).toBe(sorted[i - 1]! + 1);
    }
  });

  it("requires a name, phone and address for delivery", async () => {
    await expect(
      placeOrder({
        publicCode,
        type: "DELIVERY",
        items: [{ menuItemId: ramenId, quantity: 1 }],
        customerName: "Ana",
        customerPhone: "0123456789",
        // deliveryAddress missing
      }),
    ).rejects.toThrow();

    const { order } = await placeOrder({
      publicCode,
      type: "DELIVERY",
      items: [{ menuItemId: ramenId, quantity: 1 }],
      customerName: "Ana",
      customerPhone: "0123456789",
      deliveryAddress: "12 Riverside Road, Dhaka",
    });
    expect(order.type).toBe("DELIVERY");
    // A delivery order is not tied to the scanned table.
    expect(order.tableId).toBeNull();
    // And it carries the delivery fee on top of the subtotal — the same
    // number the checkout sheet quoted before the diner tapped ORDER.
    expect(order.deliveryFeeCents).toBe(DELIVERY_FEE_CENTS);
    expect(order.totalCents).toBe(order.subtotalCents + DELIVERY_FEE_CENTS);
  });

  it("charges no delivery fee on an order that is not delivered", async () => {
    const { order } = await placeOrder({
      publicCode,
      type: "TAKEAWAY",
      items: [{ menuItemId: ramenId, quantity: 1 }],
      customerName: "Ana",
      customerPhone: "0123456789",
    });
    expect(order.deliveryFeeCents).toBe(0);
    expect(order.totalCents).toBe(order.subtotalCents);
  });

  it("rejects an unknown table code without revealing anything", async () => {
    await expect(
      placeOrder({
        publicCode: "NOSUCHCODE",
        type: "DINE_IN",
        tableId: "x",
        items: [{ menuItemId: ramenId, quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "TABLE_NOT_FOUND" });
  });

  it("lets a diner track their own order by token alone", async () => {
    const { order, trackToken } = await placeOrder({
      publicCode,
      type: "DINE_IN",
      tableId: "x",
      items: [{ menuItemId: ramenId, quantity: 1 }],
    });

    // No tenant context at all — the token is the only credential.
    const tracked = await trackOrder(trackToken);
    expect(tracked?.id).toBe(order.id);
    expect(tracked?.items).toHaveLength(1);

    expect(await trackOrder("not-a-real-token")).toBeNull();
  });

  it("computes the business date in the location's timezone, not the server's", () => {
    // 00:30 on the 2nd in Dhaka (UTC+6) is still 18:30 on the 1st in UTC.
    // Numbering must follow the restaurant's day, or one night's service
    // would split across two dates.
    const justAfterMidnightInDhaka = new Date("2026-01-01T18:30:00Z");
    expect(businessDateFor("Asia/Dhaka", justAfterMidnightInDhaka)).toBe("2026-01-02");
    expect(businessDateFor("UTC", justAfterMidnightInDhaka)).toBe("2026-01-01");

    // An invalid timezone must not stop a diner ordering.
    expect(businessDateFor("Not/AZone", justAfterMidnightInDhaka)).toBe("2026-01-01");
  });
});
