import Link from "next/link";
import { requireSuperadmin } from "@/lib/require-superadmin";
import { platformTotals } from "@/modules/platform/platform.repository";
import { PLANS, type PlanId } from "@/modules/billing/plans";
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

      <div className="mt-8 overflow-x-auto">
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
                  <td className="py-3 pr-4">{plan.name}</td>
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
