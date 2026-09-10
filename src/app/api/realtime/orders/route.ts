import type { NextRequest } from "next/server";
import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import { channels, subscribe } from "@/server/realtime/bus";

/**
 * Server-Sent Events stream for the order board (PROMPT.md §5.3).
 *
 * SSE rather than WebSockets: it survives proxies that mangle upgrade
 * headers, and the browser reconnects on its own — which matters more
 * than duplex here, since the board only ever receives.
 *
 * Reconnection is not enough on its own, though. EventSource will
 * silently resume without telling the page what it missed, so the client
 * re-fetches every open order whenever it reconnects (see
 * use-order-stream.ts). A kitchen that stops hearing orders is this
 * product's one unrecoverable failure.
 */

// The stream must not be buffered or statically analysed.
export const dynamic = "force-dynamic";
// SSE needs a long-lived Node connection; the edge runtime's response
// streaming has different timeout behaviour across hosts.
export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;

export async function GET(request: NextRequest) {
  const tenantSlug = request.nextUrl.searchParams.get("tenant");
  const locationId = request.nextUrl.searchParams.get("locationId");

  if (!tenantSlug || !locationId) {
    return new Response("Missing tenant or locationId", { status: 400 });
  }

  // Authorised exactly like the board page itself: membership is
  // re-checked here, because an SSE endpoint is a public URL and a
  // subscription is a read of live order data.
  const { tenant } = await requireDashboardTenant(tenantSlug);

  const channel = channels.locationOrders(tenant.id, locationId);
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown, id?: number) => {
        try {
          const frame =
            (id !== undefined ? `id: ${id}\n` : "") +
            `event: ${event}\n` +
            `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(frame));
        } catch {
          // The client went away mid-write; cleanup runs via cancel().
        }
      };

      // Tell the client it is live, so it can run its initial re-sync and
      // show a connected indicator rather than guessing.
      send("ready", { channel, at: new Date().toISOString() });

      unsubscribe = subscribe(channel, (message) => {
        send(message.event, message.data, message.seq);
      });

      // Comment frames keep proxies and load balancers from closing an
      // idle connection. A kitchen can go quiet for an hour at 3pm.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          // Same as above.
        }
      }, HEARTBEAT_MS);

      request.signal.addEventListener("abort", () => {
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Tells nginx not to buffer the stream, which would otherwise hold
      // every event until the buffer fills — i.e. defeat the whole point.
      "X-Accel-Buffering": "no",
    },
  });
}
