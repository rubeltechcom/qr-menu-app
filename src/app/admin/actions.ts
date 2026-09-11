"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/require-superadmin";
import {
  setTenantPlan,
  setTenantSuspended,
} from "@/modules/platform/platform.repository";
import { PLAN_IDS, type PlanId } from "@/modules/billing/plans";

/**
 * Platform admin actions.
 *
 * Each re-checks superadmin from the database rather than trusting the
 * session — a Server Action is a public HTTP endpoint, and this one can
 * take a restaurant offline.
 */
export async function suspendTenantAction(tenantId: string) {
  await requireSuperadmin();
  await setTenantSuspended(tenantId, true);
  revalidatePath("/admin");
}

export async function restoreTenantAction(tenantId: string) {
  await requireSuperadmin();
  await setTenantSuspended(tenantId, false);
  revalidatePath("/admin");
}

/**
 * Statuses an operator may set by hand.
 *
 * A subset of what Stripe can report: these are the ones that mean
 * something when a human is deciding, rather than states only a webhook
 * should ever produce (INCOMPLETE, UNPAID, and so on).
 */
const ASSIGNABLE_STATUSES = ["ACTIVE", "TRIALING", "CANCELED"] as const;
export type AssignableStatus = (typeof ASSIGNABLE_STATUSES)[number];

export interface ChangePlanState {
  ok?: boolean;
  error?: string;
}

/**
 * Move a restaurant onto a different plan.
 *
 * Both values are checked against the lists the app actually knows
 * about — a Server Action is a public endpoint, and an unrecognised
 * plan string would leave the tenant on an effective Free plan with a
 * name nothing in the code could match.
 */
export async function changeTenantPlanAction(
  tenantId: string,
  _prevState: ChangePlanState,
  formData: FormData,
): Promise<ChangePlanState> {
  await requireSuperadmin();

  const plan = String(formData.get("plan") ?? "");
  const status = String(formData.get("subscriptionStatus") ?? "");

  if (!PLAN_IDS.includes(plan as PlanId)) {
    return { error: "That is not a plan this platform offers." };
  }
  if (!ASSIGNABLE_STATUSES.includes(status as AssignableStatus)) {
    return { error: "That subscription status cannot be set by hand." };
  }

  // Free has no subscription to be active on, so the status is forced
  // rather than trusted — otherwise the panel could show "Free /
  // ACTIVE", which reads as a paying customer who is not.
  const resolvedStatus = plan === "FREE" ? "CANCELED" : status;

  try {
    await setTenantPlan(tenantId, plan, resolvedStatus);
  } catch (error) {
    console.error("[admin] failed to change plan", error);
    return { error: "Could not change the plan. Please try again." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/tenants", "layout");
  return { ok: true };
}
