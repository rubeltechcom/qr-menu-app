import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import { isConnectConfigured, refreshConnectStatus } from "@/modules/billing/connect.service";
import { availableProviders } from "@/modules/payments/registry";
import { effectivePlan } from "@/modules/billing/plans";
import {
  refreshConnectStatusAction,
  setPaymentModeAction,
  startConnectOnboardingAction,
} from "./actions";

/**
 * How this restaurant takes money from diners.
 *
 * Three modes, because Bangladesh is not one market: plenty of places
 * only ever take cash at the counter, some want online payment for
 * delivery but not for a table, and some want it always.
 */
export const dynamic = "force-dynamic";

const MODES = [
  {
    value: "COUNTER",
    title: "Pay at the counter",
    detail: "No online payment. Diners settle with staff as usual.",
  },
  {
    value: "OPTIONAL",
    title: "Online payment optional",
    detail: "Diners may pay online after ordering, or pay at the counter.",
  },
  {
    value: "REQUIRED",
    title: "Online payment required",
    detail: "Diners are asked to pay as soon as the order is placed.",
  },
] as const;

export default async function PaymentsSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ connect?: string }>;
}) {
  const { tenantSlug } = await params;
  const { connect } = await searchParams;
  const { tenant, membership } = await requireDashboardTenant(tenantSlug);

  const isOwner = membership.role === "OWNER";
  const connectConfigured = isConnectConfigured();

  // Coming back from Stripe's onboarding flow does not mean approved,
  // so re-read the real state rather than trusting the redirect.
  let chargesEnabled = tenant.connectChargesEnabled;
  if (connect === "returned" && tenant.connectAccountId && connectConfigured) {
    chargesEnabled = await refreshConnectStatus(tenant.id);
  }

  const providers = availableProviders();
  const plan = effectivePlan(tenant);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Payments
      </h1>

      <section className="mt-6">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          How diners pay
        </h2>
        <div className="mt-3 flex flex-col gap-3">
          {MODES.map((mode) => {
            const isCurrent = tenant.paymentMode === mode.value;
            return (
              <form
                key={mode.value}
                action={setPaymentModeAction.bind(null, tenantSlug)}
                className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${
                  isCurrent
                    ? "border-blue-500 bg-blue-50/40 dark:bg-blue-950/20"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <input type="hidden" name="mode" value={mode.value} />
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {mode.title}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                    {mode.detail}
                  </p>
                </div>
                {isCurrent ? (
                  <span className="shrink-0 text-sm font-medium text-blue-700 dark:text-blue-400">
                    Current
                  </span>
                ) : isOwner ? (
                  <button
                    type="submit"
                    className="shrink-0 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    Use this
                  </button>
                ) : null}
              </form>
            );
          })}
        </div>
      </section>

      {tenant.paymentMode !== "COUNTER" && (
        <section className="mt-10">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
            Payment methods
          </h2>

          {providers.length === 0 ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              No payment provider is configured on this installation yet, so
              diners cannot pay online even though the mode above allows it.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {providers.map((provider) => (
                <li
                  key={provider.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
                >
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {provider.displayName}
                  </span>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    {provider.id === "STRIPE"
                      ? chargesEnabled
                        ? "Ready"
                        : "Finish connecting below"
                      : "Ready"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {connectConfigured && (
        <section className="mt-10 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
            Card payments (Stripe)
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Card payments go straight to your own Stripe account. We never hold
            your money.
            {plan.platformFeeBps > 0 && (
              <> A {plan.platformFeeBps / 100}% platform fee applies on your current plan.</>
            )}
          </p>

          <p className="mt-3 text-sm font-medium">
            {chargesEnabled ? (
              <span className="text-green-700 dark:text-green-400">
                Connected and able to take payments
              </span>
            ) : tenant.connectAccountId ? (
              <span className="text-amber-700 dark:text-amber-400">
                Started, but Stripe has not enabled payments yet
              </span>
            ) : (
              <span className="text-zinc-500 dark:text-zinc-400">Not connected</span>
            )}
          </p>

          {isOwner && (
            <div className="mt-4 flex flex-wrap gap-3">
              <form action={startConnectOnboardingAction.bind(null, tenantSlug)}>
                <button
                  type="submit"
                  className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white dark:bg-zinc-50 dark:text-zinc-900"
                >
                  {tenant.connectAccountId ? "Continue setup" : "Connect Stripe"}
                </button>
              </form>

              {tenant.connectAccountId && (
                <form action={refreshConnectStatusAction.bind(null, tenantSlug)}>
                  <button
                    type="submit"
                    className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    Check status
                  </button>
                </form>
              )}
            </div>
          )}
        </section>
      )}

      {!isOwner && (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
          Only the account owner can change payment settings.
        </p>
      )}
    </div>
  );
}
