import type { NextRequest } from "next/server";
import { requireStaffSession } from "@/lib/require-staff-session";
import { channels, subscribe } from "@/server/realtime/bus";

/**
 * SSE stream for the staff console (kitchen display and waiter view).
 *
 * Separate from the dashboard's stream at /api/realtime/orders because
 * the two are authenticated differently: owners hold an Auth.js session,
 * staff hold a short-lived PIN token (PROMPT.md §2). Sharing one route
 * would mean one of them checking the wrong credential.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;

export async function GET(request: NextRequest) {
  const locationId = request.nextUrl.searchParams.get("locationId");
  if (!locationId) {
    return new Response("Missing locationId", { status: 400 });
  }

  // The PIN session carries the tenant, so a tablet cannot subscribe to
  // another restaurant's orders by editing the query string.
  const session = await requireStaffSession();

  const channel = channels.locationOrders(session.tenantId, locationId);
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown, id?: number) => {
        try {
          controller.enqueue(
            encoder.encode(
              (id !== undefined ? `id: ${id}\n` : "") +
                `event: ${event}\n` +
                `data: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          // Client gone; cleanup runs via abort/cancel.
        }
      };

      send("ready", { channel, at: new Date().toISOString() });

      unsubscribe = subscribe(channel, (message) => {
        send(message.event, message.data, message.seq);
      });

      // Restaurant wifi drops constantly and proxies close idle
      // connections; the comment frame keeps this one alive.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          // Same.
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
      "X-Accel-Buffering": "no",
    },
  });
}
