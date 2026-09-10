"use server";

import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import {
  createBillingPortalSession,
  createSubscriptionCheckout,
  type BillingCycle,
} from "@/modules/billing/billing.service";
import type { PlanId } from "@/modules/billing/plans";

/**
 * Billing actions. Only an OWNER may change what the restaurant pays —
 * a manager can run the floor without being able to sign the business
 * up for $40 a month.
 */
async function requireOwner(tenantSlug: string) {
  const context = await requireDashboardTenant(tenantSlug);
  if (context.membership.role !== "OWNER") {
    throw new Error("Only the account owner can change the plan.");
  }
  return context;
}

function baseUrl(tenantSlug: string): string {
  return `${env.APP_URL.replace(/\/+$/, "")}/dashboard/${tenantSlug}/billing`;
}

export async function startSubscriptionAction(
  tenantSlug: string,
  plan: Exclude<PlanId, "FREE">,
  cycle: BillingCycle,
) {
  const { tenant, session } = await requireOwner(tenantSlug);

  const url = await createSubscriptionCheckout({
    tenantId: tenant.id,
    ownerEmail: session.user.email ?? "",
    plan,
    cycle,
    // ?checkout=done is only a hint for the UI copy. The plan itself
    // changes when the webhook arrives, never because of this redirect
    // (PROMPT.md §9).
    successUrl: `${baseUrl(tenantSlug)}?checkout=done`,
    cancelUrl: `${baseUrl(tenantSlug)}?checkout=cancelled`,
  });

  redirect(url);
}

export async function openBillingPortalAction(tenantSlug: string) {
  const { tenant, session } = await requireOwner(tenantSlug);

  const url = await createBillingPortalSession({
    tenantId: tenant.id,
    ownerEmail: session.user.email ?? "",
    returnUrl: baseUrl(tenantSlug),
  });

  redirect(url);
}
