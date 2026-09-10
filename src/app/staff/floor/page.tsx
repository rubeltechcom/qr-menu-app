import { requireStaffSession } from "@/lib/require-staff-session";
import { forTenant } from "@/server/db/tenant-client";
import * as locationRepo from "@/modules/locations/location.repository";
import * as tableRepo from "@/modules/tables/table.repository";
import { listOpenOrders } from "@/modules/orders/order.repository";
import { serializeOrder } from "@/modules/orders/order.service";
import { FloorView } from "./floor-view";

/** Waiter floor view — every table, with what each one is waiting on. */
export const dynamic = "force-dynamic";

export default async function FloorPage() {
  const session = await requireStaffSession();

  const db = forTenant(session.tenantId);
  const locations = await locationRepo.listLocations(db);
  const location = locations[0];

  if (!location) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 text-center">
        <p className="text-xl text-zinc-500">
          No location is set up yet. Ask the owner to add one.
        </p>
      </div>
    );
  }

  const [tables, orders] = await Promise.all([
    tableRepo.listTables(db, location.id),
    listOpenOrders(db, location.id),
  ]);

  return (
    <FloorView
      locationId={location.id}
      currency={location.currency}
      tables={tables.map((table) => ({ id: table.id, label: table.label }))}
      initialOrders={orders.map(serializeOrder)}
    />
  );
}
