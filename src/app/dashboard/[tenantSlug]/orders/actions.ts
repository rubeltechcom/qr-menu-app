"use server";

import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import { rejectMyOrder, transitionMyOrder } from "@/modules/orders/order.service";

/**
 * Board actions. Each re-establishes the tenant from the slug in the URL
 * and re-checks it against the caller's own membership — a Server Action
 * is a public HTTP endpoint, and a hidden button is not a permission
 * check (PROMPT.md §5.5).
 *
 * No revalidatePath here: the board is driven by SSE, and the action
 * publishes to that stream, so every open tab updates. Revalidating
 * would additionally re-render the page under the live list and make
 * the two fight.
 *
 * Service calls go inside `withTenant`. The order service resolves its
 * own tenant-scoped client from AsyncLocalStorage, and that store does
 * not survive the await on requireDashboardTenant.
 */

export async function acceptOrderAction(tenantSlug: string, orderId: string) {
  const { session, withTenant } = await requireDashboardTenant(tenantSlug);
  await withTenant(() =>
    transitionMyOrder({
      orderId,
      status: "ACCEPTED",
      actorUserId: session.user.id,
    }),
  );
}

export async function readyOrderAction(tenantSlug: string, orderId: string) {
  const { session, withTenant } = await requireDashboardTenant(tenantSlug);
  await withTenant(() =>
    transitionMyOrder({
      orderId,
      status: "READY",
      actorUserId: session.user.id,
    }),
  );
}

export async function completeOrderAction(tenantSlug: string, orderId: string) {
  const { session, withTenant } = await requireDashboardTenant(tenantSlug);
  await withTenant(() =>
    transitionMyOrder({
      orderId,
      status: "COMPLETED",
      actorUserId: session.user.id,
    }),
  );
}

export async function rejectOrderAction(
  tenantSlug: string,
  orderId: string,
  reason: string,
) {
  const { session, withTenant } = await requireDashboardTenant(tenantSlug);
  await withTenant(() =>
    rejectMyOrder(orderId, { reason: reason || undefined }, session.user.id),
  );
}
