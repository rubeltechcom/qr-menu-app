import { effectivePlan, PLANS, type PlanId } from "@/modules/billing/plans";
import type { TenantRow } from "./tenant-list";

/** Maps a repository row to what the list renders. */
export function toTenantRow(tenant: {
  id: string;
  slug: string;
  name: string;
  plan: string;
  subscriptionStatus: string;
  paymentMode: string;
  connectChargesEnabled: boolean;
  pastDueSince: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
}): TenantRow {
  const plan = PLANS[tenant.plan as PlanId] ?? PLANS.FREE;
  const enforced = effectivePlan(tenant);

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    plan: tenant.plan,
    subscriptionStatus: tenant.subscriptionStatus,
    paymentMode: tenant.paymentMode,
    connectChargesEnabled: tenant.connectChargesEnabled,
    pastDueSinceLabel: tenant.pastDueSince?.toISOString().slice(0, 10) ?? null,
    createdAtLabel: tenant.createdAt.toISOString().slice(0, 10),
    suspended: tenant.deletedAt !== null,
    enforcedPlanName: enforced.id !== plan.id ? enforced.name : null,
  };
}
