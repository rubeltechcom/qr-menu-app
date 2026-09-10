"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { SerializedOrder } from "@/modules/orders/order.service";
import { useLiveOrders } from "@/lib/use-live-orders";
import { useOrderSound } from "@/lib/use-order-sound";
import { staffAcceptOrderAction, staffReadyOrderAction } from "./actions";

/**
 * Kitchen Display System (PROMPT.md §6.3).
 *
 * Designed for a tablet propped at arm's length in a hot, bright, busy
 * room: dark ground, oversized type, one tap per action, and no
 * hover-only affordances. Cards are colour-coded by how long the order
 * has been waiting, so the thing to cook next is obvious without
 * reading a single timestamp.
 */

/** Age thresholds, in minutes, at which a ticket changes colour. */
const WARN_AFTER_MIN = 8;
const LATE_AFTER_MIN = 15;

export function KitchenDisplay({
  locationId,
  initialOrders,
}: {
  locationId: string;
  initialOrders: SerializedOrder[];
}) {
  const { isArmed, arm, play } = useOrderSound();

  const notify = useCallback(() => play(), [play]);

  const { orders, connection, patchOrder } = useLiveOrders({
    streamUrl: `/api/staff/realtime?locationId=${encodeURIComponent(locationId)}`,
    resyncUrl: `/api/staff/orders?locationId=${encodeURIComponent(locationId)}`,
    initialOrders,
    onNewOrder: notify,
  });

  // Re-render once a minute so the age colours and "12m" labels stay
  // truthful on a screen nobody touches for an hour.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const queue = orders
    .filter((order) => order.status === "PENDING" || order.status === "ACCEPTED")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-5 text-zinc-50">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Kitchen</h1>
        <div className="flex items-center gap-4">
          {!isArmed && (
            <button
              type="button"
              onClick={() => void arm()}
              className="rounded-lg bg-red-600 px-4 py-2 text-base font-semibold"
            >
              Tap to enable sound
            </button>
          )}
          <StatusDot state={connection} />
        </div>
      </header>

      {queue.length === 0 ? (
        <p className="mt-24 text-center text-2xl text-zinc-500">No orders</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {queue.map((order) => (
            <Ticket key={order.id} order={order} onOptimistic={patchOrder} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusDot({ state }: { state: "connecting" | "live" | "offline" }) {
  const map = {
    connecting: { dot: "bg-amber-400", label: "Connecting" },
    live: { dot: "bg-green-400", label: "Live" },
    // Named explicitly rather than just "Offline": staff need to know
    // the screen is still catching up, not that it has given up.
    offline: { dot: "bg-red-500", label: "Reconnecting" },
  }[state];

  return (
    <span className="flex items-center gap-2 text-base text-zinc-300">
      <span className={`h-3 w-3 rounded-full ${map.dot}`} aria-hidden />
      {map.label}
    </span>
  );
}

function Ticket({
  order,
  onOptimistic,
}: {
  order: SerializedOrder;
  onOptimistic: (id: string, changes: Partial<SerializedOrder>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const minutes = minutesSince(order.createdAt);

  // Age drives the whole card, not a small badge — a late ticket has to
  // be visible from across the pass.
  const tone =
    minutes >= LATE_AFTER_MIN
      ? "border-red-500 bg-red-950"
      : minutes >= WARN_AFTER_MIN
        ? "border-amber-500 bg-amber-950"
        : "border-zinc-700 bg-zinc-900";

  const run = (action: () => Promise<void>, optimistic: Partial<SerializedOrder>) => {
    onOptimistic(order.id, optimistic);
    startTransition(() => {
      void action().catch(() => {
        // Someone advanced it on another device. The next re-sync wins;
        // revert so the screen never shows a state the server rejected.
        onOptimistic(order.id, { status: order.status });
      });
    });
  };

  return (
    <article
      className={`rounded-xl border-2 p-4 ${tone} ${isPending ? "opacity-50" : ""}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold">#{order.orderNumber}</h2>
        <span className="text-lg font-semibold tabular-nums">
          {minutes}m
        </span>
      </div>

      <p className="mt-0.5 text-sm font-medium tracking-wide text-zinc-400 uppercase">
        {order.type.replace("_", " ")}
        {order.tableLabel ? ` · Table ${order.tableLabel}` : ""}
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {order.items.map((item) => (
          <li key={item.id} className="text-lg leading-snug">
            <span className="font-bold tabular-nums">{item.quantity}×</span>{" "}
            {item.name}
            {item.note && (
              <span className="block text-base text-amber-300">↳ {item.note}</span>
            )}
          </li>
        ))}
      </ul>

      {order.note && (
        <p className="mt-3 rounded-lg bg-amber-500/20 px-3 py-2 text-base text-amber-200">
          ⚠ {order.note}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        {order.status === "PENDING" && (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(() => staffAcceptOrderAction(order.id), { status: "ACCEPTED" })
            }
            className="flex-1 rounded-lg border-2 border-zinc-600 py-3 text-lg font-semibold disabled:opacity-50"
          >
            Start
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => staffReadyOrderAction(order.id), { status: "READY" })}
          className="flex-1 rounded-lg bg-green-600 py-3 text-lg font-bold disabled:opacity-50"
        >
          Ready
        </button>
      </div>
    </article>
  );
}

function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}
