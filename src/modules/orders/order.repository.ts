import type { TenantPrismaClient } from "@/server/db/tenant-client";
import { rawPrisma } from "@/server/db/client";
import type { OrderStatus, OrderType, Prisma } from "@prisma/client";

/**
 * Tenant-scoped order access. Order creation itself lives in the service
 * layer, because it spans a transaction (counter allocation + order +
 * items + event) that this layer would only obscure.
 */

/** Statuses that still need staff attention — what the board shows. */
export const OPEN_STATUSES: OrderStatus[] = ["PENDING", "ACCEPTED"];

const orderInclude = {
  items: { orderBy: { createdAt: "asc" } },
  table: { select: { id: true, label: true } },
  // Newest first: an order that was refunded and re-paid should show
  // its current payment, not the abandoned first attempt.
  payments: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.OrderInclude;

export type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function listOrders(
  db: TenantPrismaClient,
  params: { locationId: string; type?: OrderType; hideCompleted: boolean },
) {
  return db.order.findMany({
    where: {
      locationId: params.locationId,
      ...(params.type ? { type: params.type } : {}),
      ...(params.hideCompleted ? { status: { in: OPEN_STATUSES } } : {}),
    },
    include: orderInclude,
    // Oldest first: the order that has been waiting longest is the one
    // the kitchen should see at the top, not the newest arrival.
    orderBy: { createdAt: "asc" },
    take: 200,
  });
}

export function getOrder(db: TenantPrismaClient, id: string) {
  return db.order.findFirst({ where: { id }, include: orderInclude });
}

/**
 * Everything still open, for a client that reconnected and needs to
 * re-sync. This is the query that keeps a dropped SSE connection from
 * silently losing an order.
 */
export function listOpenOrders(db: TenantPrismaClient, locationId: string) {
  return db.order.findMany({
    where: { locationId, status: { in: OPEN_STATUSES } },
    include: orderInclude,
    orderBy: { createdAt: "asc" },
    take: 200,
  });
}

/**
 * Advance an order and record the transition in one transaction, so an
 * order can never end up in a state with no event explaining how.
 */
export async function transitionOrder(
  db: TenantPrismaClient,
  params: {
    tenantId: string;
    orderId: string;
    status: OrderStatus;
    actorUserId?: string;
    reason?: string;
  },
) {
  const timestampField = {
    ACCEPTED: "acceptedAt",
    READY: "readyAt",
    COMPLETED: "completedAt",
    REJECTED: "rejectedAt",
    PENDING: null,
  }[params.status];

  const updated = await db.order.update({
    where: { id: params.orderId },
    data: {
      status: params.status,
      ...(timestampField ? { [timestampField]: new Date() } : {}),
      ...(params.status === "REJECTED" ? { rejectionReason: params.reason ?? null } : {}),
    },
  });

  await db.orderEvent.create({
    data: {
      tenantId: params.tenantId,
      orderId: params.orderId,
      status: params.status,
      actorUserId: params.actorUserId,
      note: params.reason,
    },
  });

  return updated;
}

/** Follows a diner's own order from the token in their tracking URL. */
export function getOrderByTrackToken(db: TenantPrismaClient, trackToken: string) {
  return db.order.findFirst({ where: { trackToken }, include: orderInclude });
}

/**
 * Resolve which tenant owns a tracking token.
 *
 * Like the QR code's publicCode, a track token arrives with no tenant
 * attached — it IS the credential, and resolving it is what establishes
 * the tenant. So this one query runs unscoped, returning nothing but the
 * tenant id, and everything after it goes through forTenant().
 *
 * It is safe because the token is 128 bits of CSPRNG output: unguessable,
 * single-purpose, and it leaks no data on its own.
 */
export async function resolveTenantByTrackToken(
  trackToken: string,
): Promise<string | null> {
  const rows = await rawPrisma.$queryRaw<Array<{ tenantId: string }>>`
    SELECT "tenantId" FROM "orders" WHERE "trackToken" = ${trackToken} LIMIT 1
  `;
  return rows[0]?.tenantId ?? null;
}
