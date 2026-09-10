"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SerializedOrder } from "@/modules/orders/order.service";

export type ConnectionState = "connecting" | "live" | "offline";

/**
 * Live order feed, shared by the owner's board and the staff console.
 *
 * The two surfaces authenticate differently and so have different
 * endpoints, but the delivery guarantees must be identical — a kitchen
 * display that loses an order is exactly as bad as a board that does.
 * Keeping one implementation is what stops the two drifting apart.
 *
 * Three layers:
 *  1. SSE for instant delivery, with EventSource's own reconnect.
 *  2. A full re-sync on every (re)connect. EventSource resumes silently
 *     and never reports what it missed, so this is the layer that
 *     actually prevents a lost order.
 *  3. A slow poll underneath, for a stream that is open but wedged.
 */
const RESYNC_INTERVAL_MS = 30_000;

export function useLiveOrders(params: {
  streamUrl: string;
  resyncUrl: string;
  initialOrders: SerializedOrder[];
  onNewOrder?: (order: SerializedOrder) => void;
}) {
  const { streamUrl, resyncUrl, initialOrders, onNewOrder } = params;

  const [orders, setOrders] = useState<SerializedOrder[]>(initialOrders);
  const [connection, setConnection] = useState<ConnectionState>("connecting");

  // Held in a ref so a new callback identity from the caller does not
  // tear down and rebuild the stream — reconnecting on every render
  // would drop events in the gap.
  const onNewOrderRef = useRef(onNewOrder);
  useEffect(() => {
    onNewOrderRef.current = onNewOrder;
  }, [onNewOrder]);

  // Ids already announced, so a re-sync returning an order the stream
  // already delivered does not sound the alert twice.
  const seenIds = useRef(new Set(initialOrders.map((order) => order.id)));

  const applyOrder = useCallback((incoming: SerializedOrder, announce: boolean) => {
    setOrders((current) => {
      const index = current.findIndex((order) => order.id === incoming.id);
      if (index === -1) return [...current, incoming];
      const next = [...current];
      next[index] = incoming;
      return next;
    });

    const isNew = !seenIds.current.has(incoming.id);
    seenIds.current.add(incoming.id);
    if (announce && isNew) onNewOrderRef.current?.(incoming);
  }, []);

  const resync = useCallback(
    async (announceNew: boolean) => {
      try {
        const response = await fetch(resyncUrl, { cache: "no-store" });
        if (!response.ok) return;

        const payload = (await response.json()) as { orders: SerializedOrder[] };
        const fresh = payload.orders;
        const freshIds = new Set(fresh.map((order) => order.id));
        const unseen = fresh.filter((order) => !seenIds.current.has(order.id));

        setOrders((current) => {
          // Keep resolved orders that are still on screen (the UI fades
          // them itself), but replace open ones wholesale so a status
          // changed on another device converges here too.
          const resolved = current.filter(
            (order) => !freshIds.has(order.id) && order.status !== "PENDING",
          );
          return [...fresh, ...resolved];
        });

        for (const order of unseen) {
          seenIds.current.add(order.id);
          if (announceNew) onNewOrderRef.current?.(order);
        }
      } catch {
        // Offline or server restarting — the interval retries.
      }
    },
    [resyncUrl],
  );

  useEffect(() => {
    const source = new EventSource(streamUrl);

    const handleReady = () => {
      setConnection("live");
      // The catch-up. Announce anything that landed while we were away.
      void resync(true);
    };

    const handleCreated = (event: MessageEvent<string>) => {
      try {
        applyOrder(JSON.parse(event.data) as SerializedOrder, true);
      } catch {
        // A malformed frame must not kill the stream.
      }
    };

    const handleUpdated = (event: MessageEvent<string>) => {
      try {
        applyOrder(JSON.parse(event.data) as SerializedOrder, false);
      } catch {
        // Same.
      }
    };

    source.addEventListener("ready", handleReady);
    source.addEventListener("order.created", handleCreated as EventListener);
    source.addEventListener("order.updated", handleUpdated as EventListener);
    source.onerror = () => setConnection("offline");

    return () => {
      source.removeEventListener("ready", handleReady);
      source.removeEventListener("order.created", handleCreated as EventListener);
      source.removeEventListener("order.updated", handleUpdated as EventListener);
      source.close();
    };
  }, [streamUrl, applyOrder, resync]);

  useEffect(() => {
    const timer = setInterval(() => void resync(true), RESYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [resync]);

  /** Optimistic local update, so a tapped button responds instantly. */
  const patchOrder = useCallback((id: string, changes: Partial<SerializedOrder>) => {
    setOrders((current) =>
      current.map((order) => (order.id === id ? { ...order, ...changes } : order)),
    );
  }, []);

  return { orders, connection, patchOrder, resync };
}
