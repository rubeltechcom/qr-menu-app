import { describe, expect, it } from "vitest";
import {
  can,
  effectivePlan,
  limitFor,
  platformFeeCents,
  PLANS,
  withinLimit,
} from "../plans";

/**
 * Entitlements and fee maths. Pure functions, so these run without a
 * database — and they cover the two things that cost real money if
 * wrong: what a plan grants, and what the platform takes.
 */

const free = { plan: "FREE", subscriptionStatus: "ACTIVE" };
const smart = { plan: "SMART", subscriptionStatus: "ACTIVE" };
const pro = { plan: "PRO", subscriptionStatus: "ACTIVE" };

describe("plan entitlements", () => {
  it("grants features by plan", () => {
    expect(can(free, "customDomain")).toBe(false);
    expect(can(smart, "customDomain")).toBe(true);
    expect(can(smart, "apiAccess")).toBe(false);
    expect(can(pro, "apiAccess")).toBe(true);
  });

  it("treats null limits as unlimited, never as zero", () => {
    // The classic bug: `if (!limit)` reading "unlimited" as "none".
    expect(limitFor(pro, "locations")).toBeNull();
    expect(withinLimit(pro, "locations", 9999)).toBe(true);

    expect(limitFor(free, "tables")).toBe(10);
    expect(withinLimit(free, "tables", 9)).toBe(true);
    expect(withinLimit(free, "tables", 10)).toBe(false);
  });

  it("keeps paid features through a failed payment, then drops them", () => {
    // PROMPT.md §9 asks for a 7-day grace period — cutting a restaurant
    // off mid-service over one failed card is the wrong trade.
    expect(effectivePlan({ plan: "PRO", subscriptionStatus: "PAST_DUE" }).id).toBe("PRO");
    expect(effectivePlan({ plan: "PRO", subscriptionStatus: "TRIALING" }).id).toBe("PRO");

    // But a cancelled subscription really does fall back.
    expect(effectivePlan({ plan: "PRO", subscriptionStatus: "CANCELED" }).id).toBe("FREE");
    expect(can({ plan: "PRO", subscriptionStatus: "CANCELED" }, "apiAccess")).toBe(false);
  });

  it("falls back to Free for an unknown plan rather than throwing", () => {
    // A plan string from a webhook we do not recognise must not take
    // the dashboard down, and must not grant anything either.
    expect(effectivePlan({ plan: "ENTERPRISE", subscriptionStatus: "ACTIVE" }).id).toBe(
      "FREE",
    );
  });
});

describe("platform fee", () => {
  it("takes 1% on Free and nothing on paid plans", () => {
    // £29.85 order → 29.85 * 1% = 29.85p, rounded to 30 minor units.
    expect(platformFeeCents(free, 2985)).toBe(30);
    expect(platformFeeCents(smart, 2985)).toBe(0);
    expect(platformFeeCents(pro, 2985)).toBe(0);
  });

  it("computes in integers, with no float drift", () => {
    // 0.1 + 0.2 territory: these must be exact.
    expect(platformFeeCents(free, 1)).toBe(0);
    expect(platformFeeCents(free, 50)).toBe(1); // 0.5 rounds up
    expect(platformFeeCents(free, 49)).toBe(0);
    expect(platformFeeCents(free, 100_000)).toBe(1000);

    // And the result is always a whole number of minor units.
    for (const amount of [1, 7, 33, 999, 12_345, 999_999]) {
      expect(Number.isInteger(platformFeeCents(free, amount))).toBe(true);
    }
  });

  it("never charges a fee a paid plan did not agree to", () => {
    expect(PLANS.SMART.platformFeeBps).toBe(0);
    expect(PLANS.PRO.platformFeeBps).toBe(0);
  });
});
