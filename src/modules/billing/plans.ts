/**
 * Plan entitlements as data, not conditionals (PROMPT.md §9).
 *
 * Everything a plan grants lives in this one object, and `can()` /
 * `limitFor()` below are the only things that read it. Adding a plan, or
 * moving a feature between tiers, must never mean touching feature code
 * — if you find yourself writing `if (plan === "PRO")` anywhere else,
 * the entitlement belongs here instead.
 */

export const PLAN_IDS = ["FREE", "SMART", "PRO"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** Features a plan either grants or does not. */
export type Feature =
  | "autoTranslation"
  | "customDomain"
  | "customBranding"
  | "fullCssControl"
  | "feedback"
  | "promotions"
  | "advancedAnalytics"
  | "analyticsExport"
  | "apiAccess"
  | "posIntegration";

/** Countable limits. `null` means unlimited — never 0, never -1. */
export interface PlanLimits {
  locations: number | null;
  menuItems: number | null;
  tables: number | null;
  staffAccounts: number | null;
  /** Languages available for auto-translation; 0 when not entitled. */
  translationLanguages: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Minor units, per PROMPT.md §4's money rule. null = free. */
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  limits: PlanLimits;
  features: ReadonlySet<Feature>;
  /**
   * Basis points the platform takes from each diner order (100 bp = 1%).
   * Integer basis points rather than a float percentage, so the fee can
   * be computed with integer maths like every other amount.
   */
  platformFeeBps: number;
  support: string;
}

export const PLANS: Record<PlanId, Plan> = {
  FREE: {
    id: "FREE",
    name: "Free",
    monthlyPriceCents: null,
    yearlyPriceCents: null,
    limits: {
      locations: 1,
      // Unlimited: a restaurant should never have to pay to finish
      // typing in its own menu. What Free is limited to is *one*
      // location — that is the line the paid tiers sit above.
      menuItems: null,
      tables: 10,
      staffAccounts: 2,
      translationLanguages: 0,
    },
    features: new Set(["customBranding"]),
    platformFeeBps: 100, // 1%
    support: "Community",
  },
  SMART: {
    id: "SMART",
    name: "Smart",
    monthlyPriceCents: 2000,
    yearlyPriceCents: 20000,
    limits: {
      locations: 3,
      menuItems: null,
      tables: null,
      staffAccounts: 10,
      translationLanguages: 12,
    },
    features: new Set([
      "autoTranslation",
      "customDomain",
      "customBranding",
      "feedback",
      "promotions",
    ]),
    platformFeeBps: 0,
    support: "Email",
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    monthlyPriceCents: 4000,
    yearlyPriceCents: 40000,
    limits: {
      locations: null,
      menuItems: null,
      tables: null,
      staffAccounts: null,
      translationLanguages: 12,
    },
    features: new Set([
      "autoTranslation",
      "customDomain",
      "customBranding",
      "fullCssControl",
      "feedback",
      "promotions",
      "advancedAnalytics",
      "analyticsExport",
      "apiAccess",
      "posIntegration",
    ]),
    platformFeeBps: 0,
    support: "Priority",
  },
};

/**
 * Subscription states that still entitle a tenant to their paid plan.
 *
 * `PAST_DUE` is deliberately included: PROMPT.md §9 asks for a 7-day
 * grace period, and cutting a restaurant off mid-service over a failed
 * card is the wrong trade — dunning email first, lockout later.
 */
const ENTITLED_STATUSES = new Set(["TRIALING", "ACTIVE", "PAST_DUE"]);

export interface TenantPlanState {
  plan: string;
  subscriptionStatus: string;
}

/** The plan a tenant is actually entitled to right now. */
export function effectivePlan(tenant: TenantPlanState): Plan {
  const requested = PLANS[tenant.plan as PlanId];
  if (!requested) return PLANS.FREE;
  // A cancelled or unpaid subscription falls back to Free rather than
  // keeping paid features, but the tenant's data is untouched — see
  // the downgrade note in billing.service.ts.
  if (requested.id !== "FREE" && !ENTITLED_STATUSES.has(tenant.subscriptionStatus)) {
    return PLANS.FREE;
  }
  return requested;
}

/** The only way feature code should ask "is this allowed?". */
export function can(tenant: TenantPlanState, feature: Feature): boolean {
  return effectivePlan(tenant).features.has(feature);
}

/** `null` means unlimited. */
export function limitFor<K extends keyof PlanLimits>(
  tenant: TenantPlanState,
  limit: K,
): PlanLimits[K] {
  return effectivePlan(tenant).limits[limit];
}

/**
 * Whether one more of something may be created.
 *
 * Takes the current count rather than counting internally, so the caller
 * decides what "current" means — active rows only, or including
 * soft-deleted ones.
 */
export function withinLimit(
  tenant: TenantPlanState,
  limit: keyof PlanLimits,
  currentCount: number,
): boolean {
  const max = effectivePlan(tenant).limits[limit];
  if (max === null) return true;
  return currentCount < max;
}

/** Platform fee on a diner order, in minor units. */
export function platformFeeCents(
  tenant: TenantPlanState,
  orderTotalCents: number,
): number {
  const bps = effectivePlan(tenant).platformFeeBps;
  if (bps === 0) return 0;
  // Integer maths throughout — rounding half up, so the platform never
  // silently loses a fraction of a cent per order across a year.
  return Math.round((orderTotalCents * bps) / 10_000);
}
