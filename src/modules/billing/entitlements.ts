import type { TenantPrismaClient } from "@/server/db/tenant-client";
import { effectivePlan, withinLimit, type PlanLimits, type TenantPlanState } from "./plans";

/**
 * Enforcement of the plan limits defined in plans.ts.
 *
 * Kept separate from the plan data so the data stays declarative and
 * the counting — which needs the database — lives with the other
 * database code. Feature code calls `assertCanCreate` and gets either
 * silence or a message it can show the owner.
 */

export class PlanLimitError extends Error {
  constructor(
    message: string,
    public readonly limit: keyof PlanLimits,
    public readonly upgradeTo: string,
  ) {
    super(message);
    this.name = "PlanLimitError";
  }
}

type Countable = Extract<keyof PlanLimits, "locations" | "menuItems" | "tables" | "staffAccounts">;

async function currentCount(db: TenantPrismaClient, limit: Countable): Promise<number> {
  switch (limit) {
    case "locations":
      return db.location.count({ where: { deletedAt: null } });
    case "menuItems":
      return db.menuItem.count({ where: { deletedAt: null } });
    case "tables":
      return db.table.count({ where: { deletedAt: null } });
    case "staffAccounts":
      return db.membership.count({ where: { deletedAt: null } });
  }
}

const LABEL: Record<Countable, string> = {
  locations: "locations",
  menuItems: "menu items",
  tables: "tables",
  staffAccounts: "staff accounts",
};

/**
 * Throws if creating one more would exceed the tenant's plan.
 *
 * `adding` lets a bulk create (twenty tables at once) be checked in one
 * call instead of failing halfway through and leaving the owner with a
 * partial range.
 */
export async function assertCanCreate(
  db: TenantPrismaClient,
  tenant: TenantPlanState,
  limit: Countable,
  adding = 1,
): Promise<void> {
  const plan = effectivePlan(tenant);
  const max = plan.limits[limit];
  if (max === null) return;

  const count = await currentCount(db, limit);
  if (count + adding <= max) return;

  const upgradeTo = plan.id === "FREE" ? "Smart" : "Pro";
  const noun = LABEL[limit];

  throw new PlanLimitError(
    adding === 1
      ? `Your ${plan.name} plan includes ${max} ${noun}. Upgrade to ${upgradeTo} to add more.`
      : `Adding ${adding} ${noun} would exceed the ${max} included in your ${plan.name} plan. Upgrade to ${upgradeTo} to add more.`,
    limit,
    upgradeTo,
  );
}

/** Non-throwing form, for rendering a disabled button with a reason. */
export async function checkLimit(
  db: TenantPrismaClient,
  tenant: TenantPlanState,
  limit: Countable,
): Promise<{ allowed: boolean; used: number; max: number | null }> {
  const max = effectivePlan(tenant).limits[limit];
  const used = await currentCount(db, limit);
  return { allowed: withinLimit(tenant, limit, used), used, max };
}
