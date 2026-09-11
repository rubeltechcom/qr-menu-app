"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { PLANS, type PlanId } from "@/modules/billing/plans";

/**
 * The list of restaurants, shared by the overview and the dedicated
 * Restaurants page.
 *
 * A client component so an operator can filter without a round trip —
 * by the time a platform has a few hundred restaurants, scrolling to
 * find one is the slowest part of the job.
 *
 * Dates arrive pre-formatted as strings. Formatting a Date in the
 * browser would use the operator's locale rather than the server's and
 * change the text after hydration, which React reports as a mismatch.
 */

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  plan: string;
  subscriptionStatus: string;
  paymentMode: string;
  connectChargesEnabled: boolean;
  pastDueSinceLabel: string | null;
  createdAtLabel: string;
  suspended: boolean;
  /** What the app actually enforces, which a cancelled plan changes. */
  enforcedPlanName: string | null;
}

type Filter = "all" | "paid" | "free" | "past_due" | "suspended";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "paid", label: "Paid" },
  { id: "free", label: "Free" },
  { id: "past_due", label: "Past due" },
  { id: "suspended", label: "Suspended" },
];

export function TenantList({
  tenants,
  suspendAction,
  restoreAction,
}: {
  tenants: TenantRow[];
  suspendAction: (id: string) => Promise<void>;
  restoreAction: (id: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return tenants.filter((tenant) => {
      if (needle && !`${tenant.name} ${tenant.slug}`.toLowerCase().includes(needle)) {
        return false;
      }
      switch (filter) {
        case "paid":
          return tenant.plan !== "FREE" && !tenant.suspended;
        case "free":
          return tenant.plan === "FREE" && !tenant.suspended;
        case "past_due":
          return tenant.pastDueSinceLabel !== null;
        case "suspended":
          return tenant.suspended;
        default:
          return true;
      }
    });
  }, [tenants, query, filter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or slug"
            className="w-full rounded-lg border border-zinc-300 bg-white py-2 pr-3 pl-9 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>

        <div className="scrollbar-hide flex gap-1.5 overflow-x-auto">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === option.id
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        {visible.length} of {tenants.length} restaurants
      </p>

      {/* Cards on a phone. The table below is unreadable at that width —
          six columns of a horizontally scrolling grid is not something
          anyone can use one-handed. */}
      <div className="flex flex-col gap-3 md:hidden">
        {visible.length === 0 && (
          <p className="py-8 text-center text-zinc-500">No restaurants match.</p>
        )}
        {visible.map((tenant) => (
          <Link
            key={tenant.id}
            href={`/admin/tenants/${tenant.slug}`}
            className={`rounded-xl border border-zinc-200 bg-white p-4 shadow-sm ${
              tenant.suspended ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-zinc-900">{tenant.name}</p>
                <p className="truncate font-mono text-xs text-zinc-500">
                  {tenant.slug}
                  {tenant.suspended && " · suspended"}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-800">
                {PLANS[tenant.plan as PlanId]?.name ?? tenant.plan}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600">
              <SubscriptionBadge
                status={tenant.subscriptionStatus}
                pastDueSinceLabel={tenant.pastDueSinceLabel}
              />
              <span>{tenant.createdAtLabel}</span>
            </div>

            {tenant.enforcedPlanName && (
              <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                Enforcing {tenant.enforcedPlanName} limits
              </p>
            )}
          </Link>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
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
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-zinc-500">
                  No restaurants match.
                </td>
              </tr>
            )}
            {visible.map((tenant) => (
              <tr
                key={tenant.id}
                className={`border-b border-zinc-200 ${
                  tenant.suspended ? "opacity-50" : ""
                }`}
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
                    {tenant.suspended && " · suspended"}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  {PLANS[tenant.plan as PlanId]?.name ?? tenant.plan}
                  {/* What the app is actually enforcing, which is not
                      always what the row says: a cancelled Pro gets
                      Free's limits, and that is the number an operator
                      needs when a restaurant complains. */}
                  {tenant.enforcedPlanName && (
                    <span className="block text-xs text-amber-700">
                      enforcing {tenant.enforcedPlanName}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <SubscriptionBadge
                    status={tenant.subscriptionStatus}
                    pastDueSinceLabel={tenant.pastDueSinceLabel}
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
                  {tenant.createdAtLabel}
                </td>
                <td className="py-3">
                  <form
                    action={
                      tenant.suspended
                        ? restoreAction.bind(null, tenant.id)
                        : suspendAction.bind(null, tenant.id)
                    }
                  >
                    <button
                      type="submit"
                      className={`text-xs font-medium underline underline-offset-2 ${
                        tenant.suspended ? "text-green-700" : "text-red-600"
                      }`}
                    >
                      {tenant.suspended ? "Restore" : "Suspend"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SubscriptionBadge({
  status,
  pastDueSinceLabel,
}: {
  status: string;
  pastDueSinceLabel: string | null;
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
      {pastDueSinceLabel && (
        <span className="block text-xs">since {pastDueSinceLabel}</span>
      )}
    </span>
  );
}
