import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rawPrisma } from "@/server/db/client";
import { forTenant } from "@/server/db/tenant-client";
import { createTenantRecord } from "@/modules/tenants/tenant.repository";
import { runWithTenant } from "@/server/tenant-context";
import { placeOrder } from "@/modules/orders/order.service";
import {
  PaymentError,
  recordCounterPayment,
  recordOutcome,
  refundPayment,
} from "../payment.service";
import { loadPaymentWithAccount, resolveTenantByPaymentId } from "../payment.repository";

/**
 * Payment recording, against the real database.
 *
 * The cases here are the ones that cost money when they break:
 * idempotency (a redelivered webhook must not double-apply), terminal
 * states (a late event must not un-pay a paid order), and refund
 * bounds (a double-click must not refund twice).
 */

describe("payments", () => {
  let tenantId: string;
  let ownerId: string;
  let publicCode: string;
  let itemId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const owner = await rawPrisma.user.create({
      data: { email: `pay-owner-${stamp}@example.test`, name: "Pay Owner" },
    });
    ownerId = owner.id;

    const tenant = await createTenantRecord({
      name: "Pay Test Diner",
      slug: `pay-test-${stamp}`,
      ownerUserId: ownerId,
      defaultLocale: "en",
      currency: "USD",
    });
    tenantId = tenant.id;

    const db = forTenant(tenantId);
    const location = await db.location.create({
      data: { tenantId, name: "Pay Location", currency: "USD" },
    });
    const table = await db.table.create({
      data: {
        tenantId,
        locationId: location.id,
        label: "P1",
        publicCode: `PAY${stamp}`.slice(0, 12),
      },
    });
    publicCode = table.publicCode;

    const menu = await db.menu.create({
      data: { tenantId, locationId: location.id, name: "Pay Menu" },
    });
    const category = await db.category.create({
      data: { tenantId, menuId: menu.id, name: "Mains" },
    });
    const item = await db.menuItem.create({
      data: { tenantId, categoryId: category.id, name: "Curry", basePriceCents: 1200 },
    });
    itemId = item.id;
  });

  afterAll(async () => {
    const db = forTenant(tenantId);
    await db.paymentRefund.deleteMany({});
    await db.payment.deleteMany({});
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
      await tx.$executeRawUnsafe(
        `select set_config('app.tenant_id', $1, true)`,
        tenantId,
      );
      await tx.membership.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });
    await rawPrisma.user.delete({ where: { id: ownerId } });
    await rawPrisma.$disconnect();
  });

  async function newOrderWithPayment(provider: "STRIPE" | "BKASH" = "STRIPE") {
    const { order } = await placeOrder({
      publicCode,
      type: "DINE_IN",
      tableId: "from-qr",
      items: [{ menuItemId: itemId, quantity: 1 }],
    });

    const db = forTenant(tenantId);
    const payment = await db.payment.create({
      data: {
        tenantId,
        orderId: order.id,
        provider,
        status: "PENDING",
        amountCents: order.totalCents,
        currency: order.currency,
        providerRef: `ref_${Math.random().toString(36).slice(2)}`,
      },
    });

    return { order, payment };
  }

  it("marks the order paid, and does so only once", async () => {
    const { order, payment } = await newOrderWithPayment();

    const outcome = {
      status: "PAID" as const,
      providerRef: payment.providerRef!,
      amountCents: payment.amountCents,
    };

    // A provider redelivering the same event must be indistinguishable
    // from delivering it once.
    await recordOutcome({ tenantId, paymentId: payment.id, outcome });
    await recordOutcome({ tenantId, paymentId: payment.id, outcome });

    const db = forTenant(tenantId);
    const after = await db.payment.findFirst({ where: { id: payment.id } });
    const paidOrder = await db.order.findFirst({ where: { id: order.id } });

    expect(after?.status).toBe("PAID");
    expect(paidOrder?.paymentStatus).toBe("PAID");
    // Only one payment row for this order — no duplicate created.
    expect(await db.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("never un-pays a paid order, however late the event arrives", async () => {
    const { order, payment } = await newOrderWithPayment();

    await recordOutcome({
      tenantId,
      paymentId: payment.id,
      outcome: { status: "PAID", providerRef: payment.providerRef!, amountCents: 1200 },
    });

    // Stripe delivers "expired" hours later, out of order.
    await recordOutcome({
      tenantId,
      paymentId: payment.id,
      outcome: { status: "CANCELLED" },
    });
    await recordOutcome({
      tenantId,
      paymentId: payment.id,
      outcome: { status: "FAILED", reason: "late failure" },
    });

    const db = forTenant(tenantId);
    expect((await db.payment.findFirst({ where: { id: payment.id } }))?.status).toBe(
      "PAID",
    );
    expect((await db.order.findFirst({ where: { id: order.id } }))?.paymentStatus).toBe(
      "PAID",
    );
  });

  it("records a failure with its reason", async () => {
    const { order, payment } = await newOrderWithPayment();

    await recordOutcome({
      tenantId,
      paymentId: payment.id,
      outcome: { status: "FAILED", reason: "Card declined" },
    });

    const db = forTenant(tenantId);
    const after = await db.payment.findFirst({ where: { id: payment.id } });
    expect(after?.status).toBe("FAILED");
    expect(after?.failureReason).toBe("Card declined");
    expect((await db.order.findFirst({ where: { id: order.id } }))?.paymentStatus).toBe(
      "FAILED",
    );
  });

  it("leaves a cancelled payment's order still owing, so the diner can retry", async () => {
    const { order, payment } = await newOrderWithPayment();

    await recordOutcome({
      tenantId,
      paymentId: payment.id,
      outcome: { status: "CANCELLED" },
    });

    const db = forTenant(tenantId);
    expect((await db.payment.findFirst({ where: { id: payment.id } }))?.status).toBe(
      "CANCELLED",
    );
    // Not FAILED — the diner backed out, and can pay at the counter.
    expect((await db.order.findFirst({ where: { id: order.id } }))?.paymentStatus).toBe(
      "PENDING",
    );
  });

  it("records a counter payment without a provider", async () => {
    const { order } = await newOrderWithPayment();

    await runWithTenant(tenantId, "", () => recordCounterPayment(order.id));

    const db = forTenant(tenantId);
    const counter = await db.payment.findFirst({
      where: { orderId: order.id, provider: "COUNTER" },
    });
    expect(counter?.status).toBe("PAID");
    expect(counter?.platformFeeCents).toBe(0);
    expect((await db.order.findFirst({ where: { id: order.id } }))?.paymentStatus).toBe(
      "PAID",
    );
  });

  it("refuses to refund more than remains", async () => {
    const { payment } = await newOrderWithPayment();
    await recordOutcome({
      tenantId,
      paymentId: payment.id,
      outcome: { status: "PAID", providerRef: payment.providerRef!, amountCents: 1200 },
    });

    // A double-click, or a tampered amount, must not send out more
    // money than the diner ever paid.
    await expect(
      runWithTenant(tenantId, "", () =>
        refundPayment({ paymentId: payment.id, amountCents: 5000 }),
      ),
    ).rejects.toBeInstanceOf(PaymentError);

    await expect(
      runWithTenant(tenantId, "", () =>
        refundPayment({ paymentId: payment.id, amountCents: 0 }),
      ),
    ).rejects.toBeInstanceOf(PaymentError);
  });

  it("refuses to refund an order that was never paid", async () => {
    const { payment } = await newOrderWithPayment();

    await expect(
      runWithTenant(tenantId, "", () => refundPayment({ paymentId: payment.id })),
    ).rejects.toThrow(/only a paid order/i);
  });

  it("resolves a payment's tenant from its id alone, for the return handler", async () => {
    const { payment } = await newOrderWithPayment();

    // No tenant context at all — this is the bootstrap path a diner
    // returning from bKash takes.
    expect(await resolveTenantByPaymentId(payment.id)).toBe(tenantId);
    expect(await resolveTenantByPaymentId("nope")).toBeNull();

    const loaded = await loadPaymentWithAccount(payment.id);
    expect(loaded?.payment.id).toBe(payment.id);
    expect(loaded?.tenantId).toBe(tenantId);
  });
});
