import { PLAN_IDS } from "@/modules/billing/plans";
import { loadSettings, settingsLoaded } from "./settings.service";
import { currencySymbol, displayPlan } from "./pricing";
import type { PriceOverride } from "@/components/marketing/pricing";

/**
 * Plan prices as the marketing pages need them: plain data, ready to
 * hand to a client component.
 *
 * Loads settings first, because a marketing page can render in a worker
 * that has not run instrumentation yet and would otherwise advertise the
 * built-in prices rather than the operator's.
 */
export async function pricingProps(): Promise<{
  prices: Record<string, PriceOverride>;
  currencySymbol: string;
}> {
  if (!settingsLoaded()) await loadSettings();

  const prices: Record<string, PriceOverride> = {};
  for (const id of PLAN_IDS) {
    const plan = displayPlan(id);
    prices[id] = {
      monthlyCents: plan.displayMonthlyCents,
      yearlyCents: plan.displayYearlyCents,
    };
  }

  return { prices, currencySymbol: currencySymbol() };
}
