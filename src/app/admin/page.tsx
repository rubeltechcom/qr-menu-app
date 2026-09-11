import Link from "next/link";
import { requireSuperadmin } from "@/lib/require-superadmin";
import { platformTotals } from "@/modules/platform/platform.repository";
import { effectivePlan, PLANS, type PlanId } from "@/modules/billing/plans";
import { restoreTenantAction, suspendTenantAction } from "./actions";

/**
 * Platform admin — the SaaS operator's view across every restaurant
 * (PROMPT.md §1).
 *
 * Deliberately read-mostly. The one write available here is suspending
 * a restaurant, and even that is a soft delete: an operator should be
 * able to see everything and break very little.
 */
export const dynamic = "force-dynamic";

export default async function PlatformAdminPage() {
  // The guard, not a value: this is what makes the page superadmin-only.
  await requireSuperadmin();
  const { tenants, totalTenants, byPlan, pastDue, trialing } = await platformTotals();

  return (
    <div className="flex flex-col gap-6">
      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Restaurants" value={totalTenants} />
        <Stat label="On trial" value={trialing} />
        <Stat label="Past due" value={pastDue} tone={pastDue > 0 ? "warn" : undefined} />
        <Stat label="Paid plans" value={(byPlan.SMART ?? 0) + (byPlan.PRO ?? 0)} />
      </dl>

      {/* Cards on a phone. The table below is unreadable at that width —
          six columns of a horizontally scrolling grid is not something
          anyone can use one-handed. */}
      <div className="mt-8 flex flex-col gap-3 md:hidden">
        {tenants.length === 0 && (
          <p className="py-8 text-center text-zinc-500">No restaurants yet.</p>
        )}
        {tenants.map((tenant) => {
          const plan = PLANS[tenant.plan as PlanId] ?? PLANS.FREE;
          const entitled = effectivePlan(tenant);
          const suspended = tenant.deletedAt !== null;

          return (
            <Link
              key={tenant.id}
              href={`/admin/tenants/${tenant.slug}`}
              className={`rounded-xl border border-zinc-200 bg-white p-4 shadow-sm ${
                suspended ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-zinc-900">{tenant.name}</p>
                  <p className="truncate font-mono text-xs text-zinc-500">
                    {tenant.slug}
                    {suspended && " · suspended"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-800">
                  {plan.name}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600">
                <SubscriptionBadge
                  status={tenant.subscriptionStatus}
                  pastDueSince={tenant.pastDueSince}
                />
                <span>{tenant.createdAt.toLocaleDateString()}</span>
              </div>

              {/* The number that actually governs what they can do. */}
              {entitled.id !== plan.id && (
                <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                  Enforcing {entitled.name} limits
                </p>
              )}
            </Link>
          );
        })}
      </div>

      <div className="mt-8 hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-left">
              <th className="py-2 pr-4 font-medium">Restaurant</th>
              <th className="py-2 pr-4 font-medium">Plan</th>
              <th className="py-2 pr-4 font-medium">Subscription</th>
              <th className="py-2 pr-4 font-medium">Payments</th>
              <th className="py-2 pr-4 font-medium">Joined</th>
              <th className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-zinc-500">
                  No restaurants yet.
                </td>
              </tr>
            )}
            {tenants.map((tenant) => {
              const plan = PLANS[tenant.plan as PlanId] ?? PLANS.FREE;
              const suspended = tenant.deletedAt !== null;

              return (
                <tr
                  key={tenant.id}
                  className={`border-b border-zinc-200 ${suspended ? "opacity-50" : ""}`}
                >
                  <td className="py-3 pr-4">
                    <Link
                      href={`/admin/tenants/${tenant.slug}`}
                      className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                    >
                      {tenant.name}
                    </Link>
                    <span className="block font-mono text-xs text-zinc-500">
                      {tenant.slug}
                      {suspended && " · suspended"}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    {plan.name}
                    {/* What the app is actually enforcing, which is not
                        always what the row says: a cancelled Pro gets
                        Free's limits, and that is the number an operator
                        needs when a restaurant complains. */}
                    {effectivePlan(tenant).id !== plan.id && (
                      <span className="block text-xs text-amber-700">
                        enforcing {effectivePlan(tenant).name}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <SubscriptionBadge
                      status={tenant.subscriptionStatus}
                      pastDueSince={tenant.pastDueSince}
                    />
                  </td>
                  <td className="py-3 pr-4 text-zinc-600">
                    {tenant.paymentMode === "COUNTER"
                      ? "Counter only"
                      : tenant.connectChargesEnabled
                        ? "Online · ready"
                        : "Online · not connected"}
                  </td>
                  <td className="py-3 pr-4 text-zinc-600 tabular-nums">
                    {tenant.createdAt.toLocaleDateString()}
                  </td>
                  <td className="py-3">
                    <form
                      action={
                        suspended
                          ? restoreTenantAction.bind(null, tenant.id)
                          : suspendTenantAction.bind(null, tenant.id)
                      }
                    >
                      <button
                        type="submit"
                        className={`text-xs font-medium underline underline-offset-2 ${
                          suspended ? "text-green-700" : "text-red-600"
                        }`}
                      >
                        {suspended ? "Restore" : "Suspend"}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-zinc-500">
        Suspending hides a restaurant&apos;s storefront. Nothing is deleted — menus,
        tables and past orders stay exactly where they are.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === "warn" && value > 0 ? "text-amber-700" : "text-zinc-900"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function SubscriptionBadge({
  status,
  pastDueSince,
}: {
  status: string;
  pastDueSince: Date | null;
}) {
  const tone =
    status === "ACTIVE"
      ? "text-green-700"
      : status === "TRIALING"
        ? "text-blue-700"
        : status === "PAST_DUE"
          ? "text-amber-700"
          : "text-zinc-500";

  return (
    <span className={tone}>
      {status.toLowerCase().replace("_", " ")}
      {pastDueSince && (
        <span className="block text-xs">since {pastDueSince.toLocaleDateString()}</span>
      )}
    </span>
  );
}
