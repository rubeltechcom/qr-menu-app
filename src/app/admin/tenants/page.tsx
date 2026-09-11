import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSuperadmin } from "@/lib/require-superadmin";
import { platformTotals } from "@/modules/platform/platform.repository";
import { restoreTenantAction, suspendTenantAction } from "../actions";
import { TenantList } from "../tenant-list";
import { toTenantRow } from "../tenant-row";

/**
 * Every restaurant on the platform, searchable.
 *
 * Split out from the overview once the list grew past the point where
 * scrolling to find one was the slowest part of the operator's job.
 */
export const dynamic = "force-dynamic";

export default async function AdminTenantsPage() {
  await requireSuperadmin();
  const { tenants } = await platformTotals();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
            Restaurants
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Every restaurant on the platform. Select one to change its plan, or suspend it
            here.
          </p>
        </div>
        <Link
          href="/admin/tenants/new"
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
        >
          <Plus className="h-4 w-4" />
          New restaurant
        </Link>
      </div>

      <TenantList
        tenants={tenants.map(toTenantRow)}
        suspendAction={suspendTenantAction}
        restoreAction={restoreTenantAction}
      />

      <p className="text-xs text-zinc-500">
        Suspending hides a restaurant&apos;s storefront. Nothing is deleted — menus,
        tables and past orders stay exactly where they are.
      </p>
    </div>
  );
}
