import Link from "next/link";
import {
  ChefHat,
  CreditCard,
  LayoutGrid,
  QrCode,
  ReceiptText,
  UtensilsCrossed,
} from "lucide-react";
import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import { effectivePlan } from "@/modules/billing/plans";
import * as locationRepo from "@/modules/locations/location.repository";
import * as menuRepo from "@/modules/menu/menu.repository";
import { businessDateFor } from "@/modules/orders/order-number";

/**
 * A restaurant's home in the dashboard.
 *
 * This is where "My Restaurants" sends the owner, so it has to answer
 * the two questions someone opening it actually has — what is happening
 * right now, and what do I still need to set up — and then get out of
 * the way to the section they came for.
 */
export const dynamic = "force-dynamic";

export default async function TenantOverviewPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { db, tenant, membership } = await requireDashboardTenant(tenantSlug);

  const plan = effectivePlan(tenant);
  const locations = await locationRepo.listLocations(db);
  const location = locations[0];

  // Everything below is scoped by the tenant client, so none of these
  // counts can reach another restaurant's rows.
  const [menus, tableCount, todaysOrders, openOrders] = await Promise.all([
    location ? menuRepo.listMenusForLocation(db, location.id) : Promise.resolve([]),
    db.table.count({ where: { deletedAt: null } }),
    location
      ? db.order.count({ where: { businessDate: businessDateFor(location.timezone) } })
      : Promise.resolve(0),
    db.order.count({ where: { status: { in: ["PENDING", "ACCEPTED"] } } }),
  ]);

  const dishCount = await db.menuItem.count({ where: { deletedAt: null } });

  // The three things that must exist before a guest can order anything.
  const setup = [
    { label: "Add your location", done: Boolean(location), href: `/dashboard/${tenantSlug}/menu` },
    { label: "Build your menu", done: dishCount > 0, href: `/dashboard/${tenantSlug}/menu` },
    { label: "Print your table QR codes", done: tableCount > 0, href: `/dashboard/${tenantSlug}/tables` },
  ];
  const remaining = setup.filter((step) => !step.done);

  const sections = [
    {
      href: `/dashboard/${tenantSlug}/menu`,
      icon: UtensilsCrossed,
      title: "Menu",
      body:
        dishCount > 0
          ? `${dishCount} ${dishCount === 1 ? "dish" : "dishes"} across ${menus.length} ${menus.length === 1 ? "menu" : "menus"}`
          : "Add your first dishes and photos",
    },
    {
      href: `/dashboard/${tenantSlug}/orders`,
      icon: ReceiptText,
      title: "Orders",
      body:
        openOrders > 0
          ? `${openOrders} waiting · ${todaysOrders} today`
          : `${todaysOrders} today`,
    },
    {
      href: `/dashboard/${tenantSlug}/tables`,
      icon: QrCode,
      title: "Tables & QR codes",
      body: tableCount > 0 ? `${tableCount} tables` : "Create your first table",
    },
    {
      href: "/staff/kitchen",
      icon: ChefHat,
      title: "Kitchen display",
      body: "The screen your kitchen works from",
    },
    {
      href: `/dashboard/${tenantSlug}/payments`,
      icon: CreditCard,
      title: "Payments",
      body: "How guests pay you",
    },
    {
      href: `/dashboard/${tenantSlug}/billing`,
      icon: LayoutGrid,
      title: "Plan & billing",
      body: `${plan.name} plan`,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">{tenant.name}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {location ? location.name : "No location yet"} · {plan.name} plan ·{" "}
            {membership.role.toLowerCase()}
          </p>
        </div>

        {location && (
          <Link
            href={`/dashboard/${tenantSlug}/orders`}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
          >
            {openOrders > 0 ? `${openOrders} orders waiting` : "View orders"}
          </Link>
        )}
      </header>

      {/* Only while something is genuinely missing — a permanent
          checklist on a working restaurant's home page is noise. */}
      {remaining.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h3 className="font-medium text-amber-900">Finish setting up</h3>
          <p className="mt-1 text-sm text-amber-800">
            {remaining.length} {remaining.length === 1 ? "step" : "steps"} left before guests can
            order.
          </p>
          <ol className="mt-4 flex flex-col gap-2">
            {setup.map((step) => (
              <li key={step.label}>
                <Link
                  href={step.href}
                  className={`flex items-center gap-2.5 text-sm ${
                    step.done ? "text-amber-700 line-through" : "font-medium text-amber-900 hover:underline"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                      step.done ? "bg-amber-200 text-amber-800" : "border border-amber-400"
                    }`}
                  >
                    {step.done ? "✓" : ""}
                  </span>
                  {step.label}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Manage</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group flex flex-col rounded-xl border border-zinc-200 bg-white p-5 transition-all hover:border-zinc-300 hover:shadow-sm"
            >
              <span className="w-fit rounded-lg bg-zinc-100 p-2.5">
                <section.icon className="h-5 w-5 text-zinc-600" />
              </span>
              <h4 className="mt-4 font-semibold text-zinc-900 group-hover:text-blue-600">
                {section.title}
              </h4>
              <p className="mt-1 text-sm text-zinc-500">{section.body}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
