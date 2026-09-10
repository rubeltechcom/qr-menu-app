import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/require-superadmin";
import {
  listAllTenants,
  statsForTenant,
} from "@/modules/platform/platform.repository";
import { effectivePlan, PLANS, type PlanId } from "@/modules/billing/plans";

/** One restaurant, as the platform operator sees it. */
export const dynamic = "force-dynamic";

export default async function PlatformTenantPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireSuperadmin();

  const tenants = await listAllTenants();
  const tenant = tenants.find((candidate) => candidate.slug === slug);
  if (!tenant) notFound();

  const stats = await statsForTenant(tenant.id);
  const plan = PLANS[tenant.plan as PlanId] ?? PLANS.FREE;
  const entitled = effectivePlan(tenant);

  const money = (cents: number) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: tenant.currency,
      }).format(cents / 100);
    } catch {
      return (cents / 100).toFixed(2);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link
        href="/admin"
        className="text-sm text-zinc-500 underline-offset-2 hover:underline"
      >
        ← All restaurants
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">
        {tenant.name}
      </h1>
      <p className="mt-1 font-mono text-sm text-zinc-500">
        {tenant.slug}
        {tenant.deletedAt && " · suspended"}
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-zinc-900">
          Subscription
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Plan on record" value={plan.name} />
          {/* The two can differ: a cancelled Pro is entitled to Free,
              and it is the entitled plan the app actually enforces. */}
          <Field
            label="Entitled to"
            value={entitled.name}
            warn={entitled.id !== plan.id}
          />
          <Field
            label="Status"
            value={tenant.subscriptionStatus.toLowerCase().replace("_", " ")}
          />
          <Field
            label="Trial ends"
            value={tenant.trialEndsAt?.toLocaleDateString() ?? "—"}
          />
        </dl>
        {entitled.id !== plan.id && (
          <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This restaurant is on record as {plan.name} but its subscription is
            not in good standing, so the app is enforcing {entitled.name} limits.
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-zinc-900">Usage</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field
            label="Locations"
            value={`${stats.locations}${plan.limits.locations === null ? "" : ` / ${plan.limits.locations}`}`}
          />
          <Field
            label="Menu items"
            value={`${stats.menuItems}${plan.limits.menuItems === null ? "" : ` / ${plan.limits.menuItems}`}`}
          />
          <Field
            label="Tables"
            value={`${stats.tables}${plan.limits.tables === null ? "" : ` / ${plan.limits.tables}`}`}
          />
          <Field
            label="Staff"
            value={`${stats.staff}${plan.limits.staffAccounts === null ? "" : ` / ${plan.limits.staffAccounts}`}`}
          />
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-zinc-900">Trading</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Orders" value={String(stats.orders)} />
          <Field label="Paid orders" value={String(stats.paidOrders)} />
          <Field label="Revenue" value={money(stats.revenueCents)} />
          <Field
            label="Takes payment"
            value={
              tenant.paymentMode === "COUNTER"
                ? "Counter only"
                : tenant.connectChargesEnabled
                  ? "Online · ready"
                  : "Online · not connected"
            }
          />
        </dl>
        <p className="mt-3 text-xs text-zinc-500">
          Revenue is what diners paid this restaurant through the platform. It
          is their money, not ours — the platform fee on their plan is{" "}
          {plan.platformFeeBps === 0 ? "nil" : `${plan.platformFeeBps / 100}%`}.
        </p>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd
        className={`mt-0.5 text-sm font-medium tabular-nums ${
          warn ? "text-amber-700" : "text-zinc-900"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
