import { trackOrder } from "@/modules/orders/order.service";

/**
 * The diner's own order status, polled by the tracking page.
 *
 * No auth, for the same reason the tracking page has none: the
 * unguessable token *is* the credential. It therefore returns only what
 * that page already renders — status, the reason a rejection was given,
 * and when it was placed — rather than the full order. A token that
 * leaks (a screenshot in a group chat) then gives away nothing beyond
 * the screen it was taken from.
 *
 * A poll rather than SSE: a phone in a pocket suspends the tab
 * constantly, and a stream that silently dies while the screen is off is
 * worse than a poll that always catches up on wake.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ trackToken: string }> },
) {
  const { trackToken } = await params;

  const order = await trackOrder(trackToken);
  if (!order) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(
    {
      status: order.status,
      rejectionReason: order.rejectionReason,
      updatedAt: order.updatedAt.toISOString(),
    },
    // Never cached: a stale "being prepared" is the entire bug this
    // endpoint exists to fix.
    { headers: { "Cache-Control": "no-store" } },
  );
}
