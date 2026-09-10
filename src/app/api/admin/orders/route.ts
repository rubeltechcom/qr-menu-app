import type { NextRequest } from "next/server";
import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import { listOpenOrders } from "@/modules/orders/order.repository";
import { serializeOrder } from "@/modules/orders/order.service";

/**
 * Every currently-open order for a location.
 *
 * This is the re-sync path, and it is the layer that actually stops
 * orders being lost. SSE reconnects on its own but says nothing about
 * what arrived while it was down, so the board calls this on every
 * reconnect and on a slow interval underneath — belt and braces, because
 * a silently missed order is the one failure a restaurant cannot absorb.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const tenantSlug = request.nextUrl.searchParams.get("tenant");
  const locationId = request.nextUrl.searchParams.get("locationId");

  if (!tenantSlug || !locationId) {
    return Response.json({ error: "Missing tenant or locationId" }, { status: 400 });
  }

  const { db } = await requireDashboardTenant(tenantSlug);
  const orders = await listOpenOrders(db, locationId);

  return Response.json(
    { orders: orders.map(serializeOrder), at: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
