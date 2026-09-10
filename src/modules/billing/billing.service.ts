import Stripe from "stripe";
import { env } from "@/lib/env";
import { rawPrisma } from "@/server/db/client";
import { PLANS, type PlanId } from "./plans";

/**
 * SaaS subscriptions — the platform charging restaurants (PROMPT.md §9).
 *
 * Distinct from src/modules/payments, which is diners paying
 * restaurants. Two different flows of money in two different
 * directions; keeping them in separate modules is what stops a refund
 * on someone's dinner touching their subscription.
 *
 * Every state change here is driven by a verified webhook and never by
 * a success redirect — a diner closing the tab at the wrong moment must
 * not be able to leave a tenant on a plan they did not pay for.
 */

export class BillingError extends Error {}

let client: Stripe | null = null;

function stripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new BillingError("Billing is not configured on this installation.");
  }
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

export function isBillingConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export type BillingCycle = "monthly" | "yearly";

/** Stripe price id for a plan and cycle, or null when unconfigured. */
export function priceIdFor(plan: PlanId, cycle: BillingCycle): string | null {
  if (plan === "FREE") return null;
  const key = `${plan}_${cycle}` as const;
  return (
    {
      SMART_monthly: env.STRIPE_PRICE_SMART_MONTHLY,
      SMART_yearly: env.STRIPE_PRICE_SMART_YEARLY,
      PRO_monthly: env.STRIPE_PRICE_PRO_MONTHLY,
      PRO_yearly: env.STRIPE_PRICE_PRO_YEARLY,
    }[key] ?? null
  );
}

/**
 * Tenants are read and written here with the raw client rather than
 * forTenant(), because billing runs in two contexts where no tenant
 * scope exists: a webhook (no session at all) and the nightly
 * reconciliation job. Every function below is narrowed to a single
 * tenant id it was given, and none of them accept a filter from a
 * caller — see the note in tenant.repository.ts for the same pattern.
 */
async function loadTenant(tenantId: string) {
  const rows = await rawPrisma.$queryRaw<
    Array<{
      id: string;
      name: string;
      plan: string;
      subscriptionStatus: string;
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
    }>
  >`
    SELECT id, name, plan, "subscriptionStatus", "stripeCustomerId", "stripeSubscriptionId"
    FROM tenants WHERE id = ${tenantId} LIMIT 1
  `;
  const tenant = rows[0];
  if (!tenant) throw new BillingError("Restaurant not found.");
  return tenant;
}

/** Create the Stripe customer for a tenant, or return the existing one. */
async function ensureCustomer(tenantId: string, ownerEmail: string): Promise<string> {
  const tenant = await loadTenant(tenantId);
  if (tenant.stripeCustomerId) return tenant.stripeCustomerId;

  const customer = await stripe().customers.create({
    email: ownerEmail,
    name: tenant.name,
    // So a human in the Stripe dashboard can tell which restaurant this
    // is without cross-referencing our database.
    metadata: { tenantId },
  });

  await rawPrisma.$executeRaw`
    UPDATE tenants SET "stripeCustomerId" = ${customer.id} WHERE id = ${tenantId}
  `;
  return customer.id;
}

/**
 * Start a subscription checkout. Returns the URL to send the owner to.
 *
 * PROMPT.md §9 asks for a 14-day Pro trial without a card, so the trial
 * is configured on the subscription rather than gated behind payment
 * details.
 */
export async function createSubscriptionCheckout(params: {
  tenantId: string;
  ownerEmail: string;
  plan: Exclude<PlanId, "FREE">;
  cycle: BillingCycle;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const priceId = priceIdFor(params.plan, params.cycle);
  if (!priceId) {
    throw new BillingError(
      `No Stripe price is configured for ${PLANS[params.plan].name} ${params.cycle}. ` +
        `Set STRIPE_PRICE_${params.plan}_${params.cycle.toUpperCase()}.`,
    );
  }

  const customerId = await ensureCustomer(params.tenantId, params.ownerEmail);
  const tenant = await loadTenant(params.tenantId);

  // Only offer the trial to a tenant that has never subscribed —
  // otherwise cancelling and resubscribing would be a way to get a free
  // fortnight every month.
  const hasSubscribedBefore = Boolean(tenant.stripeSubscriptionId);

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      ...(hasSubscribedBefore ? {} : { trial_period_days: 14 }),
      metadata: { tenantId: params.tenantId, plan: params.plan },
    },
    // Repeated on the session because checkout.session.completed carries
    // the session, not the subscription.
    metadata: { tenantId: params.tenantId, plan: params.plan },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  if (!session.url) throw new BillingError("Stripe did not return a checkout URL.");
  return session.url;
}

/** The self-serve portal where an owner changes card, plan or cancels. */
export async function createBillingPortalSession(params: {
  tenantId: string;
  ownerEmail: string;
  returnUrl: string;
}): Promise<string> {
  const customerId = await ensureCustomer(params.tenantId, params.ownerEmail);
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: params.returnUrl,
  });
  return session.url;
}

/**
 * Apply a subscription's current state to a tenant.
 *
 * The single writer for plan/status, called from the webhook and from
 * the nightly reconciliation. Keeping it in one place is what makes
 * "reconciled by a nightly job" (PROMPT.md §9) a two-line job rather
 * than a second implementation that can disagree with the first.
 */
export async function applySubscriptionState(params: {
  tenantId: string;
  subscriptionId: string;
  status: string;
  plan: PlanId;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
}): Promise<void> {
  const status = normaliseStatus(params.status);

  // pastDueSince starts the 7-day grace clock, and is cleared the
  // moment a payment succeeds — so a tenant who pays on day 6 is not
  // still counted as overdue.
  const pastDueSql =
    status === "PAST_DUE"
      ? `COALESCE("pastDueSince", now())`
      : `NULL`;

  await rawPrisma.$executeRawUnsafe(
    `UPDATE tenants SET
       "stripeSubscriptionId" = $1,
       "subscriptionStatus"   = $2,
       "plan"                 = $3,
       "currentPeriodEndsAt"  = $4,
       "trialEndsAt"          = $5,
       "pastDueSince"         = ${pastDueSql}
     WHERE id = $6`,
    params.subscriptionId,
    status,
    params.plan,
    params.currentPeriodEnd,
    params.trialEnd,
    params.tenantId,
  );
}

/**
 * Stripe's statuses, mapped to ours.
 *
 * Deliberately lossy in one direction only: anything we do not
 * recognise becomes CANCELED rather than being written through, so a
 * status Stripe invents tomorrow cannot silently grant paid features.
 */
function normaliseStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    case "incomplete":
      return "INCOMPLETE";
    case "paused":
      return "PAUSED";
    default:
      return "CANCELED";
  }
}

/**
 * Downgrade a tenant to Free.
 *
 * Deliberately does not delete anything. PROMPT.md §9 asks for
 * "graceful downgrade (soft-lock excess locations read-only rather than
 * deleting anyone's data)" — the entitlement check in plans.ts is what
 * enforces the limit, and a restaurant that resubscribes finds their
 * fourth location exactly where they left it.
 */
export async function downgradeToFree(tenantId: string): Promise<void> {
  await rawPrisma.$executeRaw`
    UPDATE tenants SET
      plan = 'FREE',
      "subscriptionStatus" = 'CANCELED',
      "pastDueSince" = NULL
    WHERE id = ${tenantId}
  `;
}

/** Which plan a Stripe price id corresponds to. */
export function planForPriceId(priceId: string): PlanId | null {
  if (priceId === env.STRIPE_PRICE_SMART_MONTHLY) return "SMART";
  if (priceId === env.STRIPE_PRICE_SMART_YEARLY) return "SMART";
  if (priceId === env.STRIPE_PRICE_PRO_MONTHLY) return "PRO";
  if (priceId === env.STRIPE_PRICE_PRO_YEARLY) return "PRO";
  return null;
}
