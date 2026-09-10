import { randomBytes } from "node:crypto";
import type { OrderStatus } from "@prisma/client";
import { forTenant } from "@/server/db/tenant-client";
import { requireTenantContext } from "@/server/tenant-context";
import { publish, channels } from "@/server/realtime/bus";
import { resolveTableByPublicCode } from "@/modules/tables/table.repository";
import { allocateOrderNumber, businessDateFor } from "./order-number";
import * as repo from "./order.repository";
import {
  placeOrderSchema,
  rejectOrderSchema,
  type PlaceOrderInput,
} from "./order.schema";

export class OrderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "TABLE_NOT_FOUND"
      | "ITEM_UNAVAILABLE"
      | "EMPTY_ORDER"
      | "NOT_FOUND"
      | "INVALID_TRANSITION",
  ) {
    super(message);
    this.name = "OrderError";
  }
}

/** Unguessable, like a table's publicCode — it is the only credential. */
function generateTrackToken(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * Place an order from the storefront.
 *
 * The diner is anonymous and the request is public, so nothing about
 * money is trusted from the payload: item ids come in, and every price
 * is re-read from the database here. A tampered request can change what
 * is ordered, never what it costs.
 */
export async function placeOrder(input: unknown) {
  const parsed = placeOrderSchema.parse(input);

  // The QR code establishes the tenant — same bootstrap path as the
  // storefront menu page (see table.repository.ts).
  const table = await resolveTableByPublicCode(parsed.publicCode);
  if (!table) {
    throw new OrderError("That table code is not valid.", "TABLE_NOT_FOUND");
  }

  const db = forTenant(table.tenantId);

  // Re-read the menu items being ordered, scoped to this tenant. An id
  // belonging to another restaurant simply will not come back.
  const menuItems = await db.menuItem.findMany({
    where: {
      id: { in: parsed.items.map((line) => line.menuItemId) },
      deletedAt: null,
    },
    include: { modifierGroups: { include: { modifiers: true } } },
  });

  const byId = new Map(menuItems.map((item) => [item.id, item]));

  const lines = parsed.items.map((line) => {
    const item = byId.get(line.menuItemId);
    if (!item) {
      throw new OrderError(
        "One of the items is no longer on the menu.",
        "ITEM_UNAVAILABLE",
      );
    }
    if (!item.isAvailable) {
      throw new OrderError(`${item.name} is not available right now.`, "ITEM_UNAVAILABLE");
    }

    // Modifier prices, also re-read rather than trusted.
    const allowed = new Map(
      item.modifierGroups.flatMap((group) =>
        group.modifiers.map((modifier) => [modifier.id, { group, modifier }]),
      ),
    );

    const chosen = line.modifierIds.map((id) => {
      const found = allowed.get(id);
      if (!found) {
        throw new OrderError(
          `An option chosen for ${item.name} is no longer available.`,
          "ITEM_UNAVAILABLE",
        );
      }
      return found;
    });

    const modifierCents = chosen.reduce(
      (sum, { modifier }) => sum + modifier.priceDeltaCents,
      0,
    );
    const unitPriceCents = item.basePriceCents + modifierCents;

    return {
      menuItemId: item.id,
      nameSnapshot: item.name,
      unitPriceCents,
      quantity: line.quantity,
      lineTotalCents: unitPriceCents * line.quantity,
      modifiersSnapshot: chosen.length
        ? chosen.map(({ group, modifier }) => ({
            groupName: group.name,
            name: modifier.name,
            priceDeltaCents: modifier.priceDeltaCents,
          }))
        : undefined,
      note: line.note,
    };
  });

  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  // Delivery fees land in Phase 5 alongside payments; until then an
  // order's total is its subtotal, stated explicitly rather than implied.
  const deliveryFeeCents = 0;
  const totalCents = subtotalCents + deliveryFeeCents;

  const location = await db.location.findFirst({
    where: { id: table.locationId },
    select: { id: true, timezone: true, currency: true },
  });
  if (!location) {
    throw new OrderError("That table is not set up for ordering.", "TABLE_NOT_FOUND");
  }

  const businessDate = businessDateFor(location.timezone);
  const trackToken = generateTrackToken();

  // One transaction: allocate the number, write the order, its items and
  // its first event. The counter lock is held until this commits, so two
  // simultaneous orders cannot take the same number.
  const order = await db.$transaction(async (tx) => {
    const orderNumber = await allocateOrderNumber(tx, {
      tenantId: table.tenantId,
      locationId: location.id,
      businessDate,
    });

    const created = await tx.order.create({
      data: {
        tenantId: table.tenantId,
        locationId: location.id,
        orderNumber,
        businessDate,
        type: parsed.type,
        status: "PENDING",
        tableId: parsed.type === "DINE_IN" ? table.id : null,
        customerName: parsed.customerName,
        customerPhone: parsed.customerPhone,
        customerEmail: parsed.customerEmail,
        deliveryAddress: parsed.type === "DELIVERY" ? parsed.deliveryAddress : null,
        note: parsed.note,
        scheduledFor: parsed.scheduledFor ? new Date(parsed.scheduledFor) : null,
        subtotalCents,
        deliveryFeeCents,
        totalCents,
        currency: location.currency,
        trackToken,
        items: {
          create: lines.map((line) => ({
            tenantId: table.tenantId,
            menuItemId: line.menuItemId,
            nameSnapshot: line.nameSnapshot,
            unitPriceCents: line.unitPriceCents,
            quantity: line.quantity,
            lineTotalCents: line.lineTotalCents,
            modifiersSnapshot: line.modifiersSnapshot,
            note: line.note,
          })),
        },
        events: {
          create: { tenantId: table.tenantId, status: "PENDING" },
        },
      },
      include: {
        items: true,
        table: { select: { id: true, label: true } },
        // Always empty on a brand-new order, but included so the shape
        // matches what serializeOrder expects everywhere else.
        payments: true,
      },
    });

    return created;
  });

  // Wake the kitchen. Published after the transaction commits, so the
  // board never receives an order it cannot then read back.
  await publish(
    channels.locationOrders(table.tenantId, location.id),
    "order.created",
    serializeOrder(order),
  );

  return { order, trackToken };
}

/** Staff advancing an order from the board. */
export async function transitionMyOrder(params: {
  orderId: string;
  status: Extract<OrderStatus, "ACCEPTED" | "READY" | "COMPLETED" | "REJECTED">;
  actorUserId?: string;
  reason?: string;
}) {
  const { db, tenantId } = requireTenantContext();

  const existing = await repo.getOrder(db, params.orderId);
  if (!existing) throw new OrderError("Order not found.", "NOT_FOUND");

  // A rejected or completed order is finished; re-transitioning it would
  // quietly rewrite history that staff and the diner have already seen.
  if (existing.status === "REJECTED" || existing.status === "COMPLETED") {
    throw new OrderError(
      `Order #${existing.orderNumber} is already ${existing.status.toLowerCase()}.`,
      "INVALID_TRANSITION",
    );
  }

  await repo.transitionOrder(db, {
    tenantId,
    orderId: params.orderId,
    status: params.status,
    actorUserId: params.actorUserId,
    reason: params.reason,
  });

  const updated = await repo.getOrder(db, params.orderId);
  if (!updated) throw new OrderError("Order not found.", "NOT_FOUND");

  const payload = serializeOrder(updated);
  await publish(
    channels.locationOrders(tenantId, updated.locationId),
    "order.updated",
    payload,
  );
  // The diner's tracking page listens on its own channel.
  await publish(channels.orderTrack(updated.trackToken), "order.updated", payload);

  return updated;
}

export async function rejectMyOrder(orderId: string, input: unknown, actorUserId?: string) {
  const { reason } = rejectOrderSchema.parse(input);
  return transitionMyOrder({ orderId, status: "REJECTED", reason, actorUserId });
}

export async function listMyOrders(params: {
  locationId: string;
  type?: PlaceOrderInput["type"];
  hideCompleted: boolean;
}) {
  const { db } = requireTenantContext();
  return repo.listOrders(db, params);
}

/**
 * The diner's view of their own order, reached by an unguessable token
 * rather than a login. Scoped to the tenant that owns the order, and
 * deliberately narrow — no other diner's data is reachable from it.
 */
export async function trackOrder(trackToken: string) {
  // Resolve the owning tenant from the token first — it is the only
  // thing the URL carries. See resolveTenantByTrackToken().
  const tenantId = await repo.resolveTenantByTrackToken(trackToken);
  if (!tenantId) return null;

  const db = forTenant(tenantId);
  return repo.getOrderByTrackToken(db, trackToken);
}

/** The wire shape sent over SSE and rendered by the board. */
export function serializeOrder(order: repo.OrderWithItems) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    type: order.type,
    status: order.status,
    tableLabel: order.table?.label ?? null,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    deliveryAddress: order.deliveryAddress,
    note: order.note,
    scheduledFor: order.scheduledFor?.toISOString() ?? null,
    subtotalCents: order.subtotalCents,
    totalCents: order.totalCents,
    rejectionReason: order.rejectionReason,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    // The payment the board can act on — refund it, or see why it
    // failed. Null for a counter-service order nobody has settled yet.
    payment: order.payments[0]
      ? {
          id: order.payments[0].id,
          provider: order.payments[0].provider,
          status: order.payments[0].status,
          amountCents: order.payments[0].amountCents,
          refundedCents: order.payments[0].refundedCents,
          failureReason: order.payments[0].failureReason,
        }
      : null,
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      note: item.note,
      modifiers: item.modifiersSnapshot,
    })),
  };
}

export type SerializedOrder = ReturnType<typeof serializeOrder>;
