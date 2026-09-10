import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import { isBillingConfigured, priceIdFor } from "@/modules/billing/billing.service";
import { checkLimit } from "@/modules/billing/entitlements";
import { effectivePlan, PLANS, PLAN_IDS, type PlanId } from "@/modules/billing/plans";
import { openBillingPortalAction, startSubscriptionAction } from "./actions";

/**
 * Plan and billing.
 *
 * Shows the plan the tenant is *entitled to* rather than the one stored
 * on the row — a cancelled Pro subscription reads as Free here, which
 * is what the rest of the app enforces, so the two can never disagree
 * on screen.
 */
export const dynamic = "force-dynamic";

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { tenantSlug } = await params;
  const { checkout } = await searchParams;
  const { db, tenant, membership } = await requireDashboardTenant(tenantSlug);

  const current = effectivePlan(tenant);
  const isOwner = membership.role === "OWNER";
  const configured = isBillingConfigured();

  const usage = await Promise.all([
    checkLimit(db, tenant, "locations").then((u) => ({ label: "Locations", ...u })),
    checkLimit(db, tenant, "menuItems").then((u) => ({ label: "Menu items", ...u })),
    checkLimit(db, tenant, "tables").then((u) => ({ label: "Tables", ...u })),
    checkLimit(db, tenant, "staffAccounts").then((u) => ({ label: "Staff", ...u })),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Plan &amp; billing
      </h1>

      {checkout === "done" && (
        <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          Payment received. Your plan updates as soon as Stripe confirms it —
          usually within a few seconds.
        </p>
      )}
      {checkout === "cancelled" && (
        <p className="mt-4 rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
          Checkout cancelled. Nothing has changed.
        </p>
      )}

      <section className="mt-6 rounded-xl border border-zinc-200 p-5">
        <p className="text-sm text-zinc-500">Current plan</p>
        <p className="mt-1 text-xl font-semibold text-zinc-900">
          {current.name}
          {tenant.subscriptionStatus === "TRIALING" && tenant.trialEndsAt && (
            <span className="ml-2 text-sm font-normal text-zinc-500">
              trial ends {tenant.trialEndsAt.toLocaleDateString()}
            </span>
          )}
        </p>

        {tenant.subscriptionStatus === "PAST_DUE" && (
          <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            We could not take your last payment. Your plan keeps working for
            now — update your card to avoid losing paid features.
          </p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {usage.map((row) => (
            <div key={row.label}>
              <dt className="text-xs text-zinc-500">{row.label}</dt>
              <dd className="text-sm font-medium text-zinc-900 tabular-nums">
                {row.used}
                {row.max === null ? " / unlimited" : ` / ${row.max}`}
              </dd>
            </div>
          ))}
        </dl>

        {isOwner && tenant.stripeCustomerId && configured && (
          <form action={openBillingPortalAction.bind(null, tenantSlug)} className="mt-5">
            <button
              type="submit"
              className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700"
            >
              Manage billing, invoices and card
            </button>
          </form>
        )}
      </section>

      {!configured && (
        <p className="mt-6 rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
          Billing is not configured on this installation, so plans cannot be
          changed here yet.
        </p>
      )}

      <h2 className="mt-10 text-lg font-medium text-zinc-900">
        Plans
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {PLAN_IDS.map((planId) => (
          <PlanCard
            key={planId}
            planId={planId}
            currentPlanId={current.id}
            tenantSlug={tenantSlug}
            canChange={isOwner && configured}
          />
        ))}
      </div>

      {!isOwner && (
        <p className="mt-6 text-sm text-zinc-500">
          Only the account owner can change the plan.
        </p>
      )}
    </div>
  );
}

function PlanCard({
  planId,
  currentPlanId,
  tenantSlug,
  canChange,
}: {
  planId: PlanId;
  currentPlanId: PlanId;
  tenantSlug: string;
  canChange: boolean;
}) {
  const plan = PLANS[planId];
  const isCurrent = planId === currentPlanId;
  // A plan with no configured Stripe price cannot be bought, so say so
  // rather than showing a button that fails on click.
  const purchasable =
    planId !== "FREE" && Boolean(priceIdFor(planId, "monthly"));

  return (
    <div
      className={`rounded-xl border p-5 ${
        isCurrent
          ? "border-blue-500 bg-blue-50/40"
          : "border-zinc-200"
      }`}
    >
      <p className="text-lg font-semibold text-zinc-900">{plan.name}</p>
      <p className="mt-1 text-2xl font-bold text-zinc-900 tabular-nums">
        {plan.monthlyPriceCents === null
          ? "Free"
          : `$${(plan.monthlyPriceCents / 100).toFixed(0)}`}
        {plan.monthlyPriceCents !== null && (
          <span className="text-sm font-normal text-zinc-500">/mo</span>
        )}
      </p>

      <ul className="mt-4 flex flex-col gap-1 text-sm text-zinc-600">
        <li>{plan.limits.locations ?? "Unlimited"} locations</li>
        <li>{plan.limits.menuItems ?? "Unlimited"} menu items</li>
        <li>{plan.limits.tables ?? "Unlimited"} tables</li>
        <li>{plan.limits.staffAccounts ?? "Unlimited"} staff</li>
        <li>
          {plan.platformFeeBps === 0
            ? "No platform order fee"
            : `${plan.platformFeeBps / 100}% platform order fee`}
        </li>
        <li>{plan.support} support</li>
      </ul>

      <div className="mt-5">
        {isCurrent ? (
          <p className="text-sm font-medium text-blue-700">
            Current plan
          </p>
        ) : planId === "FREE" ? (
          <p className="text-sm text-zinc-500">
            Cancel from the billing portal to return to Free.
          </p>
        ) : !purchasable ? (
          <p className="text-sm text-zinc-500">
            Not available on this installation.
          </p>
        ) : canChange ? (
          <form
            action={startSubscriptionAction.bind(
              null,
              tenantSlug,
              planId as Exclude<PlanId, "FREE">,
              "monthly",
            )}
          >
            <button
              type="submit"
              className="w-full rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Choose {plan.name}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
