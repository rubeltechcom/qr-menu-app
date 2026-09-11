import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import * as locationRepo from "@/modules/locations/location.repository";
import { listOrders } from "@/modules/orders/order.repository";
import { serializeOrder } from "@/modules/orders/order.service";
import { OrderBoard } from "./order-board";

/**
 * The live order board.
 *
 * Rendered on the server with the current orders already in place, so a
 * kitchen tab opened mid-shift shows the queue immediately rather than
 * flashing an empty board while the stream connects. The client
 * component takes over from there.
 */
export const dynamic = "force-dynamic";

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { db } = await requireDashboardTenant(tenantSlug);

  const locations = await locationRepo.listLocations(db);
  const location = locations[0];

  if (!location) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-xl font-semibold text-zinc-900">No location yet</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Add a location and some tables before orders can arrive.
        </p>
      </div>
    );
  }

  const orders = await listOrders(db, { locationId: location.id, hideCompleted: false });

  return (
    <OrderBoard
      tenantSlug={tenantSlug}
      locationId={location.id}
      currency={location.currency}
      initialOrders={orders.map(serializeOrder)}
    />
  );
}
