"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SerializedOrder } from "@/modules/orders/order.service";

type ConnectionState = "connecting" | "live" | "offline";

/**
 * Live order feed for the board.
 *
 * Three layers, because a kitchen that stops hearing orders is the one
 * failure this product cannot absorb:
 *
 *  1. SSE for instant delivery, with EventSource's own reconnect.
 *  2. A full re-sync on every (re)connect — EventSource resumes silently
 *     and never tells the page what it missed while it was down. This is
 *     the layer that actually prevents a lost order.
 *  3. A slow poll underneath, so even a stream that is wedged open but
 *     delivering nothing still converges within a minute.
 */
const RESYNC_INTERVAL_MS = 30_000;

export function useOrderStream(params: {
  tenantSlug: string;
  locationId: string;
  initialOrders: SerializedOrder[];
  onNewOrder?: (order: SerializedOrder) => void;
}) {
  const { tenantSlug, locationId, initialOrders, onNewOrder } = params;

  const [orders, setOrders] = useState<SerializedOrder[]>(initialOrders);
  const [connection, setConnection] = useState<ConnectionState>("connecting");

  // Kept in a ref so the SSE effect does not re-subscribe every time the
  // caller passes a new closure — reconnecting on every render would
  // drop events in the gap.
  const onNewOrderRef = useRef(onNewOrder);
  useEffect(() => {
    onNewOrderRef.current = onNewOrder;
  }, [onNewOrder]);

  // Ids already seen, so a re-sync that returns an order the stream
  // already delivered does not fire the alert a second time.
  const seenIds = useRef(new Set(initialOrders.map((order) => order.id)));

  const applyOrder = useCallback((incoming: SerializedOrder, alert: boolean) => {
    setOrders((current) => {
      const index = current.findIndex((order) => order.id === incoming.id);
      if (index === -1) return [...current, incoming];
      const next = [...current];
      next[index] = incoming;
      return next;
    });

    if (alert && !seenIds.current.has(incoming.id)) {
      seenIds.current.add(incoming.id);
      onNewOrderRef.current?.(incoming);
    } else {
      seenIds.current.add(incoming.id);
    }
  }, []);

  const resync = useCallback(
    async (alertOnNew: boolean) => {
      try {
        const response = await fetch(
          `/api/admin/orders?tenant=${encodeURIComponent(tenantSlug)}&locationId=${encodeURIComponent(locationId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;

        const payload = (await response.json()) as { orders: SerializedOrder[] };
        const fresh = payload.orders;
        const freshIds = new Set(fresh.map((order) => order.id));

        // Anything that arrived while the stream was down.
        const unseen = fresh.filter((order) => !seenIds.current.has(order.id));

        setOrders((current) => {
          // Keep resolved orders that are still on screen (the board
          // fades them out itself) but replace open ones wholesale, so a
          // status changed elsewhere converges here too.
          const resolved = current.filter(
            (order) => !freshIds.has(order.id) && order.status !== "PENDING",
          );
          return [...fresh, ...resolved];
        });

        for (const order of unseen) {
          seenIds.current.add(order.id);
          if (alertOnNew) onNewOrderRef.current?.(order);
        }
      } catch {
        // Offline or server restarting — the interval will retry.
      }
    },
    [tenantSlug, locationId],
  );

  useEffect(() => {
    const url = `/api/realtime/orders?tenant=${encodeURIComponent(tenantSlug)}&locationId=${encodeURIComponent(locationId)}`;
    const source = new EventSource(url);

    const handleReady = () => {
      setConnection("live");
      // The catch-up: alert on anything that landed while we were away.
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
    source.onerror = () => {
      // EventSource retries on its own; reflect the gap in the UI so
      // staff can see the board is not currently live.
      setConnection("offline");
    };

    return () => {
      source.removeEventListener("ready", handleReady);
      source.removeEventListener("order.created", handleCreated as EventListener);
      source.removeEventListener("order.updated", handleUpdated as EventListener);
      source.close();
    };
  }, [tenantSlug, locationId, applyOrder, resync]);

  // Layer three: the safety net under a stream that is open but silent.
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
