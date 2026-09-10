"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import { runWithTenant } from "@/server/tenant-context";
import {
  recordCounterPayment,
  refundPayment,
} from "@/modules/payments/payment.service";

/**
 * Payment actions available from the order board.
 *
 * Refunds are restricted to OWNER and MANAGER: a waiter marking an
 * order served should not also be able to send money back out of the
 * business.
 */

export async function refundOrderAction(
  tenantSlug: string,
  paymentId: string,
  reason: string,
) {
  const { tenant, membership, session } = await requireDashboardTenant(tenantSlug);
  if (membership.role !== "OWNER" && membership.role !== "MANAGER") {
    throw new Error("Only an owner or manager can issue a refund.");
  }

  // refundPayment reads the tenant from context; awaiting inside
  // runWithTenant is safe here because no React render boundary is
  // crossed (see the note on runWithTenant).
  await runWithTenant(tenant.id, tenant.slug, () =>
    refundPayment({
      paymentId,
      reason: reason || undefined,
      actorUserId: session.user.id,
    }),
  );

  revalidatePath(`/dashboard/${tenantSlug}/orders`);
}

/** Staff took cash or a card at the counter. */
export async function markPaidAtCounterAction(tenantSlug: string, orderId: string) {
  const { tenant } = await requireDashboardTenant(tenantSlug);

  await runWithTenant(tenant.id, tenant.slug, () => recordCounterPayment(orderId));

  revalidatePath(`/dashboard/${tenantSlug}/orders`);
}
