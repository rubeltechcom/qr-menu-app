import { Check, Minus } from "lucide-react";
import { requireSuperadmin } from "@/lib/require-superadmin";
import {
  loadSettings,
  renderSettings,
  settingsLoaded,
} from "@/modules/platform/settings.service";
import { currencySymbol, displayPlans } from "@/modules/platform/pricing";
import { SettingsForm } from "../settings/settings-form";

/**
 * Plans and pricing.
 *
 * Prices are editable, because an operator selling in taka should not
 * need a redeploy to say so. Limits and features are shown but not
 * editable: they are what the app enforces on every request, and a
 * mistyped limit in an admin panel would hand every restaurant
 * unlimited everything with no obvious symptom. Changing those stays a
 * code change, reviewed and tested.
 */
export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  await requireSuperadmin();
  if (!settingsLoaded()) await loadSettings();

  const groups = renderSettings().filter((group) => group.id === "pricing");
  const plans = displayPlans();
  const symbol = currencySymbol();

  const money = (cents: number | null) =>
    cents === null ? "Free" : `${symbol}${(cents / 100).toFixed(0)}`;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
          Plans & pricing
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          What each plan costs and what it includes. Prices here drive the public pricing
          page.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
          >
            <h3 className="font-semibold text-zinc-900">{plan.name}</h3>
            <p className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
              {money(plan.displayMonthlyCents)}
              {plan.displayMonthlyCents !== null && (
                <span className="text-sm font-normal text-zinc-500">/mo</span>
              )}
            </p>
            {plan.displayYearlyCents !== null && (
              <p className="text-xs text-zinc-500">
                {money(plan.displayYearlyCents)} billed yearly
              </p>
            )}

            <dl className="mt-4 flex flex-col gap-1.5 border-t border-zinc-100 pt-4 text-sm">
              <Limit label="Locations" value={plan.limits.locations} />
              <Limit label="Menu items" value={plan.limits.menuItems} />
              <Limit label="Tables" value={plan.limits.tables} />
              <Limit label="Staff accounts" value={plan.limits.staffAccounts} />
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Order fee</dt>
                <dd className="font-medium text-zinc-900 tabular-nums">
                  {plan.platformFeeBps === 0
                    ? "None"
                    : `${(plan.platformFeeBps / 100).toFixed(2)}%`}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-col gap-1 border-t border-zinc-100 pt-4">
              {FEATURE_LABELS.map(([feature, label]) => {
                const included = plan.features.has(feature);
                return (
                  <p
                    key={feature}
                    className={`flex items-center gap-2 text-xs ${
                      included ? "text-zinc-700" : "text-zinc-400"
                    }`}
                  >
                    {included ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                    ) : (
                      <Minus className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {label}
                  </p>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <SettingsForm groups={groups} />

      <p className="text-xs text-zinc-500">
        Changing a price changes what the pricing page advertises. Restaurants already
        subscribed keep being billed on the Stripe price they signed up with, so nobody is
        silently re-charged — move them to a new price in Stripe for that. Limits and
        features are enforced by the app on every request and are set in code.
      </p>
    </div>
  );
}

const FEATURE_LABELS = [
  ["autoTranslation", "Auto-translation"],
  ["customDomain", "Custom domain"],
  ["customBranding", "Custom branding"],
  ["feedback", "Guest feedback"],
  ["promotions", "Promotions"],
  ["advancedAnalytics", "Advanced analytics"],
  ["apiAccess", "API access"],
  ["posIntegration", "POS integration"],
] as const;

function Limit({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-900 tabular-nums">
        {value === null ? "Unlimited" : value}
      </dd>
    </div>
  );
}
