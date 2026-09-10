import type { NextRequest } from "next/server";
import { requireStaffSession } from "@/lib/require-staff-session";
import { forTenant } from "@/server/db/tenant-client";
import { listOpenOrders } from "@/modules/orders/order.repository";
import { serializeOrder } from "@/modules/orders/order.service";

/**
 * Open orders for a staff device — the re-sync path behind the kitchen
 * display and waiter view.
 *
 * "Must survive network loss" (PROMPT.md §6.3) is not satisfied by
 * reconnecting alone: the stream comes back silently and says nothing
 * about what arrived while it was down. This is what fills that gap.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const locationId = request.nextUrl.searchParams.get("locationId");
  if (!locationId) {
    return Response.json({ error: "Missing locationId" }, { status: 400 });
  }

  const session = await requireStaffSession();
  const db = forTenant(session.tenantId);
  const orders = await listOpenOrders(db, locationId);

  return Response.json(
    { orders: orders.map(serializeOrder), at: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
