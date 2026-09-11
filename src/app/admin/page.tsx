import Link from "next/link";
import { ArrowRight, Store, AlertTriangle, Clock, CreditCard } from "lucide-react";
import { requireSuperadmin } from "@/lib/require-superadmin";
import { platformTotals } from "@/modules/platform/platform.repository";
import { restoreTenantAction, suspendTenantAction } from "./actions";
import { TenantList } from "./tenant-list";
import { toTenantRow } from "./tenant-row";

/**
 * Platform admin — the SaaS operator's view across every restaurant
 * (PROMPT.md §1).
 *
 * The numbers that say whether the business is healthy, then the ten
 * most recent sign-ups. The full, searchable list lives at
 * /admin/tenants so this page stays glanceable.
 */
export const dynamic = "force-dynamic";

const RECENT_LIMIT = 10;

export default async function PlatformAdminPage() {
  // The guard, not a value: this is what makes the page superadmin-only.
  await requireSuperadmin();
  const { tenants, totalTenants, byPlan, pastDue, trialing } = await platformTotals();

  const recent = tenants.slice(0, RECENT_LIMIT);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
          Platform overview
        </h2>
        <p className="mt-1 text-sm text-zinc-600">How the platform is doing right now.</p>
      </div>

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Restaurants"
          value={totalTenants}
          icon={<Store className="h-4 w-4" />}
        />
        <Stat label="On trial" value={trialing} icon={<Clock className="h-4 w-4" />} />
        <Stat
          label="Past due"
          value={pastDue}
          tone={pastDue > 0 ? "warn" : undefined}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <Stat
          label="Paid plans"
          value={(byPlan.SMART ?? 0) + (byPlan.PRO ?? 0)}
          icon={<CreditCard className="h-4 w-4" />}
        />
      </dl>

      {pastDue > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-medium text-amber-900">
            {pastDue} {pastDue === 1 ? "restaurant is" : "restaurants are"} past due.
          </p>
          <p className="mt-0.5 text-sm text-amber-800">
            They keep working on Free&apos;s limits until the payment clears.
          </p>
        </div>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="font-semibold text-zinc-900">Newest restaurants</h3>
          <Link
            href="/admin/tenants"
            className="flex shrink-0 items-center gap-1 text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
          >
            All {totalTenants}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <TenantList
          tenants={recent.map(toTenantRow)}
          suspendAction={suspendTenantAction}
          restoreAction={restoreTenantAction}
        />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone?: "warn";
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <dt className="flex items-center gap-1.5 text-xs text-zinc-500">
        {icon}
        {label}
      </dt>
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
