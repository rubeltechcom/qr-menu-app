import { rawPrisma } from "@/server/db/client";
import { forTenant } from "@/server/db/tenant-client";

/**
 * The two bootstrap lookups payments need.
 *
 * Both run before any tenant is known, for the same reason the QR
 * code's publicCode does: a diner returning from bKash has no session,
 * and a webhook has no session at all. Each resolves the owning tenant
 * from an unguessable reference and nothing else; every read after that
 * goes through forTenant().
 */

/** Which tenant owns a payment row. */
export async function resolveTenantByPaymentId(
  paymentId: string,
): Promise<string | null> {
  const rows = await rawPrisma.$queryRaw<Array<{ tenantId: string }>>`
    SELECT "tenantId" FROM payments WHERE id = ${paymentId} LIMIT 1
  `;
  return rows[0]?.tenantId ?? null;
}

/** Which tenant owns an order, from the diner's tracking token. */
export async function resolveTenantByTrackToken(
  trackToken: string,
): Promise<string | null> {
  const rows = await rawPrisma.$queryRaw<Array<{ tenantId: string }>>`
    SELECT "tenantId" FROM orders WHERE "trackToken" = ${trackToken} LIMIT 1
  `;
  return rows[0]?.tenantId ?? null;
}

/**
 * A payment plus the connected account needed to talk to the provider
 * about it, scoped to its own tenant.
 */
export async function loadPaymentWithAccount(paymentId: string) {
  const tenantId = await resolveTenantByPaymentId(paymentId);
  if (!tenantId) return null;

  const db = forTenant(tenantId);
  const payment = await db.payment.findFirst({ where: { id: paymentId } });
  if (!payment) return null;

  const tenant = await db.tenant.findFirst({
    where: { id: tenantId },
    select: { connectAccountId: true },
  });

  return { tenantId, payment, connectAccountId: tenant?.connectAccountId ?? null };
}

/** An order and its tenant, from the diner's tracking token. */
export async function loadOrderForPayment(trackToken: string) {
  const tenantId = await resolveTenantByTrackToken(trackToken);
  if (!tenantId) return null;

  const db = forTenant(tenantId);
  const order = await db.order.findFirst({ where: { trackToken } });
  if (!order) return null;

  const tenant = await db.tenant.findFirst({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      plan: true,
      subscriptionStatus: true,
      connectAccountId: true,
      connectChargesEnabled: true,
      paymentMode: true,
    },
  });
  if (!tenant) return null;

  return { tenantId, order, tenant };
}
