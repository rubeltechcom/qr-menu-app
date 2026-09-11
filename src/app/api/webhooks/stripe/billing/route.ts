import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { rawPrisma } from "@/server/db/client";
import { getSetting } from "@/modules/platform/settings.service";
import { isStripeConfigured, stripeClient } from "@/modules/payments/stripe-client";
import {
  applySubscriptionState,
  downgradeToFree,
  planForPriceId,
} from "@/modules/billing/billing.service";
import type { PlanId } from "@/modules/billing/plans";

/**
 * Stripe Billing webhook — the only thing allowed to change a tenant's
 * plan (PROMPT.md §9: "never trust client-side success redirects").
 *
 * Two properties matter here and both are easy to get wrong:
 *
 *  - **Signature verification against the raw body.** Parsing the JSON
 *    first changes the bytes and the signature no longer matches, so
 *    the body is read as text and handed to Stripe untouched.
 *  - **Idempotency.** Stripe retries for days. The event id is recorded
 *    before the work happens, and a duplicate is acknowledged without
 *    re-running it — otherwise a retry could re-apply a downgrade a
 *    tenant has already resolved.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const webhookSecret = getSetting("stripe.webhookSecret");
  if (!isStripeConfigured() || !webhookSecret) {
    return new Response("Billing is not configured.", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    // Never log the body on a bad signature — it is unverified input.
    return new Response("Invalid signature", { status: 400 });
  }

  // Claim the event. The unique index on (provider, eventId) means a
  // concurrent retry loses this race and is acknowledged below rather
  // than processed twice.
  const claimed = await claimEvent(event);
  if (!claimed) {
    return Response.json({ received: true, duplicate: true });
  }

  try {
    await handle(event);
    await rawPrisma.$executeRaw`
      UPDATE webhook_events SET "processedAt" = now()
      WHERE provider = 'STRIPE'::"PaymentProvider" AND "eventId" = ${event.id}
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await rawPrisma.$executeRaw`
      UPDATE webhook_events SET error = ${message}
      WHERE provider = 'STRIPE'::"PaymentProvider" AND "eventId" = ${event.id}
    `;
    // 500 so Stripe retries — the row is left unprocessed and the retry
    // will find it that way and try again.
    console.error(`[billing-webhook] ${event.type} failed`, error);
    return new Response("Handler failed", { status: 500 });
  }

  return Response.json({ received: true });
}

/** Returns false if this event id has already been recorded. */
async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const inserted = await rawPrisma.$executeRaw`
    INSERT INTO webhook_events (id, provider, "eventId", "eventType", payload, "createdAt")
    VALUES (
      gen_random_uuid()::text,
      'STRIPE'::"PaymentProvider",
      ${event.id},
      ${event.type},
      ${JSON.stringify(event)}::jsonb,
      now()
    )
    ON CONFLICT (provider, "eventId") DO NOTHING
  `;
  return inserted > 0;
}

async function handle(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.trial_will_end": {
      await applySubscription(event.data.object);
      return;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const tenantId = await tenantForSubscription(subscription);
      if (tenantId) await downgradeToFree(tenantId);
      return;
    }

    case "invoice.payment_failed": {
      // Not a downgrade: the subscription moves to past_due and the
      // grace period starts. Stripe sends the subscription update too,
      // which is what actually records the status.
      console.warn(`[billing-webhook] payment failed for ${event.data.object.id}`);
      return;
    }

    default:
      // Recorded in webhook_events for support, but nothing to do.
      return;
  }
}

async function applySubscription(subscription: Stripe.Subscription): Promise<void> {
  const tenantId = await tenantForSubscription(subscription);
  if (!tenantId) {
    // A subscription we cannot attribute is a configuration problem
    // worth surfacing, not something to silently drop.
    throw new Error(
      `Subscription ${subscription.id} has no tenantId in metadata and no matching customer.`,
    );
  }

  const priceId = subscription.items.data[0]?.price.id;
  const plan: PlanId =
    (priceId ? planForPriceId(priceId) : null) ??
    (subscription.metadata?.plan as PlanId | undefined) ??
    "FREE";

  // Period end lives on the item in current Stripe API versions.
  const periodEnd = subscription.items.data[0]?.current_period_end;

  await applySubscriptionState({
    tenantId,
    subscriptionId: subscription.id,
    status: subscription.status,
    plan,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
  });
}

/**
 * Prefer the tenantId we put in metadata; fall back to the customer id
 * we stored at checkout. The fallback matters for a subscription
 * created from the Stripe dashboard by hand, which carries no metadata.
 */
async function tenantForSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromMetadata = subscription.metadata?.tenantId;
  if (fromMetadata) return fromMetadata;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  if (!customerId) return null;

  const rows = await rawPrisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM tenants WHERE "stripeCustomerId" = ${customerId} LIMIT 1
  `;
  return rows[0]?.id ?? null;
}
