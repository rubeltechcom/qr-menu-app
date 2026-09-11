import { PLANS, type Plan, type PlanId } from "@/modules/billing/plans";
import { getSetting } from "./settings.service";

/**
 * Advertised plan prices, with the operator's overrides applied.
 *
 * Prices live in plans.ts as the built-in default and can be overridden
 * from /admin/plans, so an operator can sell in their own currency
 * without a redeploy.
 *
 * This deliberately affects the *shop window* only — the pricing page
 * and the plan picker. It does not touch what an existing subscriber is
 * charged: that is fixed by the Stripe price they subscribed on, and
 * changing a number in an admin panel must never silently re-bill
 * somebody. Nor does it touch `limits` or `features`, which are what
 * the app enforces; making entitlements editable at runtime would mean
 * a typo could hand every restaurant unlimited everything.
 */

export interface DisplayPlan extends Plan {
  /** The price to show, after any override. */
  displayMonthlyCents: number | null;
  displayYearlyCents: number | null;
}

/** Whole currency units in the settings table; cents everywhere else. */
function overrideCents(key: string): number | null {
  const raw = getSetting(key)?.trim();
  if (!raw) return null;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function currencySymbol(): string {
  return getSetting("pricing.currencySymbol")?.trim() || "$";
}

const OVERRIDE_KEYS: Record<PlanId, { monthly: string; yearly: string } | null> = {
  FREE: null,
  SMART: { monthly: "pricing.smartMonthly", yearly: "pricing.smartYearly" },
  PRO: { monthly: "pricing.proMonthly", yearly: "pricing.proYearly" },
};

export function displayPlan(id: PlanId): DisplayPlan {
  const plan = PLANS[id];
  const keys = OVERRIDE_KEYS[id];

  return {
    ...plan,
    // `??` rather than `||`: an override of 0 is a real price (a plan
    // the operator has made free for a promotion), not a missing value.
    displayMonthlyCents: keys
      ? (overrideCents(keys.monthly) ?? plan.monthlyPriceCents)
      : plan.monthlyPriceCents,
    displayYearlyCents: keys
      ? (overrideCents(keys.yearly) ?? plan.yearlyPriceCents)
      : plan.yearlyPriceCents,
  };
}

export function displayPlans(): DisplayPlan[] {
  return (Object.keys(PLANS) as PlanId[]).map(displayPlan);
}
