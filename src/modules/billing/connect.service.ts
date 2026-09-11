import type Stripe from "stripe";
import { rawPrisma } from "@/server/db/client";
import { isStripeConfigured, stripeClient } from "@/modules/payments/stripe-client";

/**
 * Stripe Connect onboarding — how a restaurant gets paid.
 *
 * Standard accounts (PROMPT.md §2), so money settles directly to the
 * restaurant and Stripe carries the KYC and payout obligations. The
 * platform takes an application fee and never holds the restaurant's
 * funds.
 *
 * Runs without a tenant scope for the same reason billing.service does:
 * it is called from a webhook as well as the dashboard. Every query is
 * narrowed to one tenant id the caller already established.
 */

function stripe(): Stripe {
  return stripeClient();
}

export function isConnectConfigured(): boolean {
  return isStripeConfigured();
}

/**
 * Start or resume onboarding. Returns the URL to send the owner to.
 *
 * Account links expire after a few minutes and are single-use, so this
 * is called fresh each time rather than stored — a stale link is a
 * confusing dead end for someone halfway through KYC.
 */
export async function createConnectOnboardingLink(params: {
  tenantId: string;
  tenantName: string;
  ownerEmail: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<string> {
  const rows = await rawPrisma.$queryRaw<Array<{ connectAccountId: string | null }>>`
    SELECT "connectAccountId" FROM tenants WHERE id = ${params.tenantId} LIMIT 1
  `;

  let accountId = rows[0]?.connectAccountId ?? null;

  if (!accountId) {
    const account = await stripe().accounts.create({
      type: "standard",
      email: params.ownerEmail,
      business_profile: { name: params.tenantName },
      metadata: { tenantId: params.tenantId },
    });
    accountId = account.id;

    await rawPrisma.$executeRaw`
      UPDATE tenants SET "connectAccountId" = ${accountId} WHERE id = ${params.tenantId}
    `;
  }

  const link = await stripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: params.returnUrl,
    refresh_url: params.refreshUrl,
  });

  return link.url;
}

/**
 * Re-read whether the account can actually take payments.
 *
 * `charges_enabled` is the only trustworthy signal: an owner can finish
 * the onboarding form and still be blocked pending verification, and
 * showing them a live payment button in that state produces failed
 * checkouts nobody can explain.
 */
export async function refreshConnectStatus(tenantId: string): Promise<boolean> {
  const rows = await rawPrisma.$queryRaw<Array<{ connectAccountId: string | null }>>`
    SELECT "connectAccountId" FROM tenants WHERE id = ${tenantId} LIMIT 1
  `;
  const accountId = rows[0]?.connectAccountId;
  if (!accountId) return false;

  const account = await stripe().accounts.retrieve(accountId);
  const enabled = Boolean(account.charges_enabled);

  await rawPrisma.$executeRaw`
    UPDATE tenants SET "connectChargesEnabled" = ${enabled} WHERE id = ${tenantId}
  `;

  return enabled;
}
