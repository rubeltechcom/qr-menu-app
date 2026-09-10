import type { NextRequest } from "next/server";
import { rawPrisma } from "@/server/db/client";
import { getProvider } from "@/modules/payments/registry";
import { recordOutcome } from "@/modules/payments/payment.service";
import { resolveTenantByPaymentId } from "@/modules/payments/payment.repository";

/**
 * Stripe webhook for diner order payments.
 *
 * Separate route from the billing webhook because the two carry
 * different events and settle different money — a Connect payment
 * failing should never be handled by the code that manages a
 * subscription.
 *
 * Two properties, both easy to get wrong:
 *  - Signature verified against the RAW body (parsing changes the bytes).
 *  - Idempotent: the event id is claimed before any work happens, so
 *    Stripe's retries cannot pay an order twice.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const parsed = await getProvider("STRIPE").parseWebhook({
    rawBody,
    headers: request.headers,
  });

  // Null means the signature did not verify. Respond 400 and never
  // touch the payload — it is unverified input.
  if (!parsed) return new Response("Invalid signature", { status: 400 });

  const claimed = await claimEvent(parsed.eventId, parsed.eventType, parsed.payload);
  if (!claimed) return Response.json({ received: true, duplicate: true });

  try {
    if (parsed.paymentId && parsed.outcome) {
      const tenantId = await resolveTenantByPaymentId(parsed.paymentId);
      if (tenantId) {
        await recordOutcome({
          tenantId,
          paymentId: parsed.paymentId,
          outcome: parsed.outcome,
        });
      }
    }

    await rawPrisma.$executeRaw`
      UPDATE webhook_events SET "processedAt" = now()
      WHERE provider = 'STRIPE'::"PaymentProvider" AND "eventId" = ${parsed.eventId}
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await rawPrisma.$executeRaw`
      UPDATE webhook_events SET error = ${message}
      WHERE provider = 'STRIPE'::"PaymentProvider" AND "eventId" = ${parsed.eventId}
    `;
    // 500 so Stripe retries; the row stays unprocessed for the retry.
    console.error(`[order-webhook] ${parsed.eventType} failed`, error);
    return new Response("Handler failed", { status: 500 });
  }

  return Response.json({ received: true });
}

/** False when this event id has already been recorded. */
async function claimEvent(
  eventId: string,
  eventType: string,
  payload: unknown,
): Promise<boolean> {
  const inserted = await rawPrisma.$executeRaw`
    INSERT INTO webhook_events (id, provider, "eventId", "eventType", payload, "createdAt")
    VALUES (
      gen_random_uuid()::text,
      'STRIPE'::"PaymentProvider",
      ${eventId},
      ${eventType},
      ${JSON.stringify(payload)}::jsonb,
      now()
    )
    ON CONFLICT (provider, "eventId") DO NOTHING
  `;
  return inserted > 0;
}
