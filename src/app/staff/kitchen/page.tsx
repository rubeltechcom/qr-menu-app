import { requireStaffSession } from "@/lib/require-staff-session";
import { forTenant } from "@/server/db/tenant-client";
import * as locationRepo from "@/modules/locations/location.repository";
import { listOpenOrders } from "@/modules/orders/order.repository";
import { serializeOrder } from "@/modules/orders/order.service";
import { alertSettings } from "@/modules/platform/alert-settings";
import { loadSettings, settingsLoaded } from "@/modules/platform/settings.service";
import { KitchenDisplay } from "./kitchen-display";

/**
 * Kitchen display — the tablet screen by the pass.
 *
 * Rendered with the current queue already in place so a tablet that
 * reboots mid-service comes back showing real tickets, not an empty
 * screen waiting for the stream to connect.
 */
export const dynamic = "force-dynamic";

export default async function KitchenPage() {
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

  const orders = await listOpenOrders(db, location.id);

  // How the operator configured alerts, resolved once on the server.
  if (!settingsLoaded()) await loadSettings();
  const alerts = alertSettings();

  return (
    <KitchenDisplay
      alerts={alerts}
      locationId={location.id}
      currency={location.currency}
      initialOrders={orders.map(serializeOrder)}
    />
  );
}
