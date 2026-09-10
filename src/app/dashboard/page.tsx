import { requireAuth } from "@/lib/require-auth";
import { listMembershipsForUser } from "@/modules/tenants/membership.repository";
import { isSuperadmin } from "@/lib/require-superadmin";
import Link from "next/link";
import { ShieldAlert, ArrowRight, Store } from "lucide-react";

export default async function DashboardPage() {
  const session = await requireAuth();
  const memberships = await listMembershipsForUser(session.user.id);
  const isSuper = await isSuperadmin(session.user.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
          Welcome back, {session.user.name ?? session.user.email?.split('@')[0] ?? "User"}!
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Manage your restaurants or select one to continue.
        </p>
      </div>

      {isSuper && memberships.length === 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-blue-100 p-2">
              <ShieldAlert className="h-6 w-6 text-blue-700" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-blue-900">You are a Platform Administrator</h3>
              <p className="mt-1 text-sm text-blue-700">
                You don't have any individual restaurants assigned to you, but as a Platform Admin, you can manage the entire system.
              </p>
              <div className="mt-4">
                <Link
                  href="/admin"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  Go to Platform Admin
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-medium tracking-wide text-zinc-500 uppercase">
          Your Restaurants
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {memberships.map((m) => (
            <Link
              key={m.id}
              href={`/dashboard/${m.tenant.slug}`}
              className="group flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5 transition-all hover:border-zinc-300 hover:shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="rounded-lg bg-zinc-100 p-2.5">
                  <Store className="h-5 w-5 text-zinc-600" />
                </div>
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800">
                  {m.role}
                </span>
              </div>
              <div className="mt-4">
                <h4 className="font-semibold text-zinc-900 group-hover:text-blue-600">
                  {m.tenant.name}
                </h4>
                <p className="mt-1 flex items-center text-xs text-zinc-500">
                  {m.tenant.slug} · {m.tenant.plan.toLowerCase()} plan
                </p>
              </div>
            </Link>
          ))}
          {memberships.length === 0 && !isSuper && (
            <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 py-12">
              <Store className="h-8 w-8 text-zinc-400" />
              <p className="mt-4 text-sm font-medium text-zinc-900">No restaurants found</p>
              <p className="mt-1 text-sm text-zinc-500">You haven't been added to any restaurants yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
