"use server";

import type { OrderStatus } from "@prisma/client";
import { requireStaffSession } from "@/lib/require-staff-session";
import { runWithTenant } from "@/server/tenant-context";
import { transitionMyOrder } from "@/modules/orders/order.service";

/**
 * Kitchen and waiter actions.
 *
 * Authorised by the PIN session rather than an owner login, and the
 * tenant comes from that session rather than from anything the tablet
 * sends — so a tampered request cannot advance another restaurant's
 * orders.
 */
async function advance(
  orderId: string,
  status: Extract<OrderStatus, "ACCEPTED" | "READY" | "COMPLETED">,
) {
  const session = await requireStaffSession();

  // transitionMyOrder() reads the tenant from context. Awaiting inside
  // runWithTenant is fine here: unlike a Server Component, no React
  // render boundary is crossed, so the AsyncLocalStorage store survives.
  return runWithTenant(session.tenantId, "", () =>
    transitionMyOrder({ orderId, status, actorUserId: session.userId }),
  );
}

export async function staffAcceptOrderAction(orderId: string) {
  await advance(orderId, "ACCEPTED");
}

export async function staffReadyOrderAction(orderId: string) {
  await advance(orderId, "READY");
}

export async function staffCompleteOrderAction(orderId: string) {
  await advance(orderId, "COMPLETED");
}
