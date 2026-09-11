"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS, PLAN_IDS, type Plan } from "@/modules/billing/plans";

/**
 * The public pricing table.
 *
 * Every limit and feature is read from src/modules/billing/plans.ts —
 * the same object the dashboard enforces with. A limit stated here that
 * the product did not deliver would be worse than no pricing page, so
 * there is deliberately nowhere to type one.
 *
 * Prices are the one exception: they come in as props, because an
 * operator can override them from /admin/plans to sell in their own
 * currency. Everything else still comes from the enforcing object.
 */

export interface PriceOverride {
  monthlyCents: number | null;
  yearlyCents: number | null;
}

function priceLabel(price: PriceOverride, yearly: boolean, symbol: string): string {
  const cents = yearly ? price.yearlyCents : price.monthlyCents;
  if (cents === null) return "Free";
  return `${symbol}${Math.round(cents / 100)}`;
}

/** What a plan includes, phrased for a restaurant owner. */
function benefits(plan: Plan): string[] {
  const limits = plan.limits;
  const lines: string[] = [];

  lines.push(
    limits.locations === null
      ? "Unlimited locations"
      : limits.locations === 1
        ? "QR menu for one location"
        : `Up to ${limits.locations} locations`,
  );

  lines.push("Unlimited dine-in, takeaway & delivery orders");
  lines.push(
    limits.menuItems === null
      ? "Unlimited categories & menu items"
      : `Up to ${limits.menuItems} menu items`,
  );
  lines.push(
    limits.tables === null
      ? "Unlimited tables & QR codes"
      : `Up to ${limits.tables} table QR codes`,
  );
  lines.push(
    limits.staffAccounts === null
      ? "Unlimited staff accounts"
      : `${limits.staffAccounts} staff accounts`,
  );

  lines.push(
    plan.platformFeeBps > 0
      ? `Online payments at card rates + ${plan.platformFeeBps / 100}% fee`
      : "Online payments with no platform fee",
  );

  if (plan.features.has("autoTranslation")) {
    lines.push(`Automatic menu translation (${limits.translationLanguages} languages)`);
  }
  if (plan.features.has("customDomain")) lines.push("Your own domain");
  if (plan.features.has("feedback")) lines.push("Customer feedback");
  if (plan.features.has("promotions")) lines.push("Promotions & discounts");
  if (plan.features.has("advancedAnalytics")) lines.push("Advanced analytics");
  if (plan.features.has("posIntegration")) lines.push("POS integration");

  lines.push(`${plan.support} support`);
  return lines;
}

export function Pricing({
  id = "pricing",
  prices,
  currencySymbol = "$",
}: {
  id?: string;
  /** Operator overrides, keyed by plan id. Falls back to plans.ts. */
  prices?: Partial<Record<string, PriceOverride>>;
  currencySymbol?: string;
}) {
  const [yearly, setYearly] = useState(false);

  return (
    <section id={id} className="mx-auto max-w-6xl px-6 py-20">
      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          Start free. Upgrade when it pays for itself.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-600">
          Every plan includes the QR menu, the ordering system and the kitchen display. No
          setup fee, and no card needed to start.
        </p>
      </div>

      <div className="mt-10 flex justify-center">
        <div className="inline-flex rounded-full border border-zinc-200 bg-white p-1">
          {[
            { value: false, label: "Monthly" },
            { value: true, label: "Yearly" },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setYearly(option.value)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                yearly === option.value
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {option.label}
              {option.value && (
                <span className="ml-1.5 text-xs font-medium opacity-80">
                  2 months free
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {PLAN_IDS.map((id) => {
          const plan = PLANS[id];
          const price: PriceOverride = prices?.[id] ?? {
            monthlyCents: plan.monthlyPriceCents,
            yearlyCents: plan.yearlyPriceCents,
          };
          // Smart is the one most restaurants land on, so it leads.
          const featured = plan.id === "SMART";

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border p-8 ${
                featured
                  ? "border-zinc-900 bg-white shadow-xl lg:-my-4 lg:py-12"
                  : "border-zinc-200 bg-white"
              }`}
            >
              {featured && (
                <span className="absolute -top-3 left-8 rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}

              <h3 className="text-lg font-semibold text-zinc-900">{plan.name}</h3>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight text-zinc-900">
                  {priceLabel(price, yearly, currencySymbol)}
                </span>
                {price.monthlyCents !== null && (
                  <span className="text-sm font-medium text-zinc-500">
                    /{yearly ? "year" : "month"}
                  </span>
                )}
              </div>

              <Link
                href={`/signup?plan=${plan.id.toLowerCase()}`}
                className={`mt-6 rounded-full px-5 py-3 text-center text-sm font-semibold transition-colors ${
                  featured
                    ? "bg-zinc-900 text-white hover:bg-zinc-700"
                    : "border border-zinc-300 text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                {price.monthlyCents === null ? "Create free menu" : `Choose ${plan.name}`}
              </Link>

              <ul className="mt-8 flex flex-col gap-3">
                {benefits(plan).map((benefit) => (
                  <li
                    key={benefit}
                    className="flex items-start gap-2.5 text-sm text-zinc-700"
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
