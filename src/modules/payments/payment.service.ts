import { env } from "@/lib/env";
import { forTenant } from "@/server/db/tenant-client";
import { requireTenantContext } from "@/server/tenant-context";
import { publish, channels } from "@/server/realtime/bus";
import { serializeOrder } from "@/modules/orders/order.service";
import { getOrder } from "@/modules/orders/order.repository";
import { platformFeeCents } from "@/modules/billing/plans";
import { getProvider } from "./registry";
import { loadOrderForPayment, loadPaymentWithAccount } from "./payment.repository";
import type { PaymentOutcome, ProviderId } from "./provider";

/**
 * Diner payments — money flowing from a diner to a restaurant.
 *
 * Separate from src/modules/billing, which is the platform charging
 * restaurants. Two different directions of money; keeping them apart is
 * what stops a refund on someone's dinner touching a subscription.
 *
 * The rule this module exists to enforce: an order becomes PAID because
 * the *provider* said so, never because a browser came back to a
 * success URL. Both the return handler and the webhook funnel into
 * `recordOutcome`, which is idempotent.
 */

export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_FOUND"
      | "NOT_CONFIGURED"
      | "ALREADY_PAID"
      | "REFUND_TOO_LARGE"
      | "NOT_REFUNDABLE",
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

/** How a restaurant takes money from diners. */
export type PaymentMode = "COUNTER" | "OPTIONAL" | "REQUIRED";

export function paymentModeOf(tenant: { paymentMode: string }): PaymentMode {
  const mode = tenant.paymentMode;
  return mode === "OPTIONAL" || mode === "REQUIRED" ? mode : "COUNTER";
}

/**
 * Start an online payment for an order.
 *
 * Called from the storefront after the order exists, so a payment that
 * is abandoned leaves a real order the restaurant can still chase —
 * rather than a lost sale with nothing to show for it.
 */
export async function startPayment(params: {
  trackToken: string;
  provider: ProviderId;
}): Promise<{ redirectUrl: string; paymentId: string }> {
  const provider = getProvider(params.provider);
  if (!provider.isConfigured()) {
    throw new PaymentError(
      `${provider.displayName} is not set up for this restaurant.`,
      "NOT_CONFIGURED",
    );
  }

  // The track token is the diner's only credential — same bootstrap
  // shape as a table's publicCode.
  const found = await loadOrderForPayment(params.trackToken);
  if (!found) throw new PaymentError("Order not found.", "NOT_FOUND");
  const { tenantId, order, tenant } = found;
  const db = forTenant(tenantId);

  if (order.paymentStatus === "PAID") {
    throw new PaymentError("This order has already been paid.", "ALREADY_PAID");
  }

  const feeCents = platformFeeCents(tenant, order.totalCents);

  // bKash settles into the configured merchant account with no
  // marketplace split, so a platform fee cannot be taken inline. Record
  // zero rather than pretending we collected it — a fee we did not
  // actually take must not appear in the books as though we did.
  const collectableFee = params.provider === "STRIPE" ? feeCents : 0;

  const payment = await db.payment.create({
    data: {
      tenantId,
      orderId: order.id,
      provider: params.provider,
      status: "PENDING",
      amountCents: order.totalCents,
      currency: order.currency,
      platformFeeCents: collectableFee,
    },
  });

  const base = env.APP_URL.replace(/\/+$/, "");

  try {
    const created = await provider.createPayment({
      paymentId: payment.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountCents: order.totalCents,
      currency: order.currency,
      platformFeeCents: collectableFee,
      returnUrl: `${base}/order/${params.trackToken}/paid?payment=${payment.id}`,
      cancelUrl: `${base}/order/${params.trackToken}?payment=cancelled`,
      destinationAccountId: tenant.connectAccountId,
      restaurantName: tenant.name,
      customerEmail: order.customerEmail ?? undefined,
      customerPhone: order.customerPhone ?? undefined,
    });

    await db.payment.update({
      where: { id: payment.id },
      data: {
        providerRef: created.providerRef,
        providerSessionRef: created.sessionRef,
      },
    });

    return { redirectUrl: created.redirectUrl, paymentId: payment.id };
  } catch (error) {
    // Mark the attempt failed rather than leaving a PENDING row that
    // nothing will ever resolve.
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureReason: error instanceof Error ? error.message : "Provider error",
      },
    });
    throw error;
  }
}

/**
 * Ask the provider what happened and record it.
 *
 * This is the return-from-provider path. A redirect proves the diner's
 * browser came back, nothing more — so the provider is asked directly
 * (PROMPT.md §9), and the answer goes through the same idempotent write
 * the webhook uses.
 */
export async function verifyAndRecord(paymentId: string): Promise<PaymentOutcome> {
  const found = await loadPaymentWithAccount(paymentId);
  if (!found) throw new PaymentError("Payment not found.", "NOT_FOUND");

  const { tenantId, payment, connectAccountId } = found;

  // Already resolved — nothing to ask, and nothing to write.
  if (payment.status === "PAID") {
    return { status: "PAID", providerRef: payment.providerRef ?? "", amountCents: payment.amountCents };
  }
  if (!payment.providerRef) return { status: "PENDING" };

  const provider = getProvider(payment.provider as ProviderId);
  const outcome = await provider.verifyPayment({
    providerRef: payment.providerRef,
    sessionRef: payment.providerSessionRef,
    accountId: connectAccountId,
  });

  await recordOutcome({ tenantId, paymentId, outcome });
  return outcome;
}

/**
 * Apply a provider's verdict to a payment and its order.
 *
 * Idempotent by design: both the webhook and the return handler call
 * this, often for the same payment within a second of each other, and a
 * provider will happily redeliver a webhook days later. Writing PAID
 * twice must be indistinguishable from writing it once.
 */
export async function recordOutcome(params: {
  tenantId: string;
  paymentId: string;
  outcome: PaymentOutcome;
}): Promise<void> {
  const db = forTenant(params.tenantId);

  const payment = await db.payment.findFirst({ where: { id: params.paymentId } });
  if (!payment) return;

  // A terminal state never moves again. Without this, a late-arriving
  // "expired" webhook could un-pay an order the diner already settled.
  if (payment.status === "PAID" || payment.status === "REFUNDED") return;

  switch (params.outcome.status) {
    case "PAID": {
      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          providerRef: params.outcome.providerRef || payment.providerRef,
        },
      });
      await db.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: "PAID" },
      });
      break;
    }

    case "FAILED": {
      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          failureReason: params.outcome.reason,
        },
      });
      await db.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: "FAILED" },
      });
      break;
    }

    case "CANCELLED": {
      await db.payment.update({
        where: { id: payment.id },
        data: { status: "CANCELLED" },
      });
      // The order's payment status stays PENDING: the diner can try
      // again, or pay at the counter.
      break;
    }

    case "PENDING":
      return;
  }

  // Tell the board and the diner's tracking page, so a card paid at the
  // table turns green without anyone refreshing.
  const order = await getOrder(db, payment.orderId);
  if (order) {
    const payload = serializeOrder(order);
    await publish(
      channels.locationOrders(params.tenantId, order.locationId),
      "order.updated",
      payload,
    );
    await publish(channels.orderTrack(order.trackToken), "order.updated", payload);
  }
}

/**
 * Refund an order, in whole or in part.
 *
 * Staff-initiated, so it runs inside a tenant context. The amount is
 * validated against what is actually left unrefunded rather than
 * trusted from the caller — a double-click must not refund twice.
 */
export async function refundPayment(params: {
  paymentId: string;
  amountCents?: number;
  reason?: string;
  actorUserId?: string;
}): Promise<void> {
  const { db, tenantId } = requireTenantContext();

  const payment = await db.payment.findFirst({ where: { id: params.paymentId } });
  if (!payment) throw new PaymentError("Payment not found.", "NOT_FOUND");

  if (payment.status !== "PAID" && payment.status !== "PARTIALLY_REFUNDED") {
    throw new PaymentError(
      "Only a paid order can be refunded.",
      "NOT_REFUNDABLE",
    );
  }
  if (!payment.providerRef) {
    throw new PaymentError("That payment has no provider reference.", "NOT_REFUNDABLE");
  }

  const remaining = payment.amountCents - payment.refundedCents;
  const amount = params.amountCents ?? remaining;

  if (amount <= 0 || amount > remaining) {
    throw new PaymentError(
      `You can refund at most ${(remaining / 100).toFixed(2)} on this order.`,
      "REFUND_TOO_LARGE",
    );
  }

  const tenant = await db.tenant.findFirst({
    where: { id: tenantId },
    select: { connectAccountId: true },
  });

  const provider = getProvider(payment.provider as ProviderId);
  const result = await provider.refund({
    providerRef: payment.providerRef,
    sessionRef: payment.providerSessionRef,
    amountCents: amount,
    reason: params.reason,
    accountId: tenant?.connectAccountId ?? null,
  });

  const refundedTotal = payment.refundedCents + amount;

  await db.paymentRefund.create({
    data: {
      tenantId,
      paymentId: payment.id,
      amountCents: amount,
      reason: params.reason,
      providerRef: result.providerRef,
      actorUserId: params.actorUserId,
    },
  });

  await db.payment.update({
    where: { id: payment.id },
    data: {
      refundedCents: refundedTotal,
      status: refundedTotal >= payment.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED",
    },
  });

  await db.order.update({
    where: { id: payment.orderId },
    data: {
      paymentStatus:
        refundedTotal >= payment.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED",
    },
  });

  const order = await getOrder(db, payment.orderId);
  if (order) {
    const payload = serializeOrder(order);
    await publish(
      channels.locationOrders(tenantId, order.locationId),
      "order.updated",
      payload,
    );
    await publish(channels.orderTrack(order.trackToken), "order.updated", payload);
  }
}

/** Record cash or card taken at the counter, so every order has an answer. */
export async function recordCounterPayment(orderId: string): Promise<void> {
  const { db, tenantId } = requireTenantContext();

  const order = await db.order.findFirst({ where: { id: orderId } });
  if (!order) throw new PaymentError("Order not found.", "NOT_FOUND");
  if (order.paymentStatus === "PAID") return;

  await db.payment.create({
    data: {
      tenantId,
      orderId: order.id,
      provider: "COUNTER",
      status: "PAID",
      amountCents: order.totalCents,
      currency: order.currency,
      platformFeeCents: 0,
      paidAt: new Date(),
    },
  });

  await db.order.update({
    where: { id: order.id },
    data: { paymentStatus: "PAID" },
  });

  const updated = await getOrder(db, order.id);
  if (updated) {
    const payload = serializeOrder(updated);
    await publish(
      channels.locationOrders(tenantId, updated.locationId),
      "order.updated",
      payload,
    );
    await publish(channels.orderTrack(updated.trackToken), "order.updated", payload);
  }
}
