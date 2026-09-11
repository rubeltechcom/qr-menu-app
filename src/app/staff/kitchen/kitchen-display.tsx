"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { SerializedOrder } from "@/modules/orders/order.service";
import { useLiveOrders } from "@/lib/use-live-orders";
import { useOrderAlerts, type AlertPreferences } from "@/lib/use-order-alerts";
import { StaffHeader } from "@/components/staff/staff-header";
import { RejectDialog } from "@/components/orders/reject-dialog";
import {
  staffAcceptOrderAction,
  staffReadyOrderAction,
  staffRejectOrderAction,
} from "./actions";

/**
 * Kitchen Display System (PROMPT.md §6.3).
 *
 * Designed for a tablet propped at arm's length in a hot, bright, busy
 * room: a light ground that stays readable under kitchen lighting,
 * oversized type, and one tap per action with no hover-only
 * affordances. Cards are colour-coded by how long the order has been
 * waiting, so the thing to cook next is obvious without reading a
 * single timestamp.
 *
 * Every ticket shows its items outright. A cook should never have to
 * tap a card to find out what to cook.
 */

/** Age thresholds, in minutes, at which a ticket changes colour. */
const WARN_AFTER_MIN = 8;
const LATE_AFTER_MIN = 15;

const TABS = ["ALL", "DINE_IN", "TAKEAWAY", "DELIVERY"] as const;

export function KitchenDisplay({
  locationId,
  currency,
  initialOrders,
  alerts,
}: {
  locationId: string;
  currency: string;
  initialOrders: SerializedOrder[];
  /** How the operator configured alerts in /admin/settings. */
  alerts?: AlertPreferences;
}) {
  const { announce, isFullyArmed, enableAll, setWaitingCount } = useOrderAlerts(alerts);

  const { orders, connection, patchOrder } = useLiveOrders({
    streamUrl: `/api/staff/realtime?locationId=${encodeURIComponent(locationId)}`,
    resyncUrl: `/api/staff/orders?locationId=${encodeURIComponent(locationId)}`,
    initialOrders,
    onNewOrder: announce,
  });

  const money = useMemo(() => makeMoneyFormatter(currency), [currency]);

  // Re-render once a minute so the age colours and "12m" labels stay
  // truthful on a screen nobody touches for an hour.
  const [, setTick] = useState(0);
  const [activeTab, setActiveTab] = useState<"ALL" | "DINE_IN" | "TAKEAWAY" | "DELIVERY">(
    "ALL",
  );

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const queue = orders
    .filter((order) => order.status === "PENDING" || order.status === "ACCEPTED")
    .filter((order) => activeTab === "ALL" || order.type === activeTab)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const waiting = queue.filter((order) => order.status === "PENDING").length;

  // Drives the repeat chime: it keeps sounding while tickets sit
  // unaccepted and stops the moment the queue is cleared.
  useEffect(() => {
    setWaitingCount(waiting);
  }, [waiting, setWaitingCount]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <StaffHeader
        title="Kitchen"
        subtitle={
          queue.length === 0
            ? "Nothing cooking"
            : `${queue.length} in the queue${waiting > 0 ? ` · ${waiting} new` : ""}`
        }
        connection={connection}
        isFullyArmed={isFullyArmed}
        onEnableAlerts={() => void enableAll()}
      >
        <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto">
          {TABS.map((tab) => {
            const count =
              tab === "ALL"
                ? queue.length
                : queue.filter((order) => order.type === tab).length;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
                  activeTab === tab
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {tab.replace("_", " ")}
                {count > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-xs tabular-nums ${
                      activeTab === tab ? "bg-white/20" : "bg-white"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </StaffHeader>

      {queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-32 text-center">
          <span className="text-5xl">🍽️</span>
          <p className="mt-4 text-2xl font-semibold text-zinc-700">All caught up</p>
          <p className="mt-1 text-zinc-500">New orders appear here automatically.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 px-4 py-5 sm:px-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {queue.map((order) => (
            <Ticket
              key={order.id}
              order={order}
              money={money}
              onOptimistic={patchOrder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function makeMoneyFormatter(currency: string) {
  let format: Intl.NumberFormat | null = null;
  try {
    format = new Intl.NumberFormat(undefined, { style: "currency", currency });
  } catch {
    // An unrecognised code must not blank out a ticket's prices.
  }
  return (cents: number) =>
    format ? format.format(cents / 100) : (cents / 100).toFixed(2);
}

function Ticket({
  order,
  money,
  onOptimistic,
}: {
  order: SerializedOrder;
  money: (cents: number) => string;
  onOptimistic: (id: string, changes: Partial<SerializedOrder>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isRejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minutes = minutesSince(order.createdAt);

  // Age drives the whole card, not a small badge — a late ticket has to
  // be visible from across the pass.
  const isLate = minutes >= LATE_AFTER_MIN;
  const isWarn = minutes >= WARN_AFTER_MIN;
  const tone = isLate
    ? "border-red-500 bg-red-50"
    : isWarn
      ? "border-amber-400 bg-amber-50"
      : "border-zinc-200 bg-white";

  const run = (action: () => Promise<void>, optimistic: Partial<SerializedOrder>) => {
    setError(null);
    onOptimistic(order.id, optimistic);
    startTransition(() => {
      void action().catch((cause: unknown) => {
        // Someone advanced it on another device. The next re-sync wins;
        // revert so the screen never shows a state the server rejected —
        // but say why, or the button just looks broken.
        onOptimistic(order.id, { status: order.status });
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : "That didn't go through. Try again.",
        );
      });
    });
  };

  const orderTime = new Date(order.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-xl border-2 shadow-sm ${tone} ${
        isPending ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-black/5 px-4 py-3">
        <div>
          <p className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
            {order.type.replace("_", " ")}
          </p>
          <h2 className="text-2xl leading-tight font-bold text-zinc-900">
            #{order.orderNumber}
          </h2>
        </div>

        <div className="text-right">
          {/* How long it has been waiting, which is the number the
              kitchen actually works from. */}
          <p
            className={`text-2xl font-bold tabular-nums ${
              isLate ? "text-red-600" : isWarn ? "text-amber-600" : "text-zinc-400"
            }`}
          >
            {minutes}m
          </p>
          <p className="text-xs text-zinc-500 tabular-nums">{orderTime}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-black/5 px-4 py-2 text-sm">
        {order.tableLabel ? (
          <span className="font-semibold text-zinc-800">Table {order.tableLabel}</span>
        ) : (
          <span className="text-zinc-600">{order.customerName || "Walk-in"}</span>
        )}
        {order.scheduledFor && (
          <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
            for{" "}
            {new Date(order.scheduledFor).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>

      {/* Always visible: a cook must never tap a card to find out what
          to cook. */}
      <ul className="flex flex-1 flex-col gap-2 px-4 py-3">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-3 text-base">
            <span className="text-zinc-900">
              <span className="font-bold tabular-nums">{item.quantity}×</span>{" "}
              <span className="font-medium">{item.name}</span>
              {item.note && (
                <span className="mt-0.5 block text-sm font-medium text-amber-700">
                  ↳ {item.note}
                </span>
              )}
            </span>
            <span className="shrink-0 text-sm text-zinc-500 tabular-nums">
              {money(item.lineTotalCents)}
            </span>
          </li>
        ))}
      </ul>

      {order.note && (
        <p className="mx-4 mb-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900">
          ⚠ {order.note}
        </p>
      )}

      {(order.customerPhone || order.deliveryAddress) && (
        <div className="mx-4 mb-3 rounded-lg bg-black/[0.03] px-3 py-2 text-sm text-zinc-700">
          {order.customerPhone && <p>{order.customerPhone}</p>}
          {order.deliveryAddress && <p className="mt-0.5">{order.deliveryAddress}</p>}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mx-4 mb-3 rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-800"
        >
          {error}
        </p>
      )}

      <div className="mt-auto flex gap-2 border-t border-black/5 p-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => setRejecting(true)}
          className="rounded-lg bg-white px-4 py-3 text-sm font-bold text-red-700 ring-1 ring-red-200 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          Reject
        </button>

        {/* Only while it is still new: once the kitchen has started, the
            next thing to say is that it is ready. */}
        {order.status === "PENDING" && (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(() => staffAcceptOrderAction(order.id), { status: "ACCEPTED" })
            }
            className="flex-1 rounded-lg bg-white px-4 py-3 text-sm font-bold text-zinc-800 ring-1 ring-zinc-300 transition-colors hover:bg-zinc-50 disabled:opacity-50"
          >
            Start cooking
          </button>
        )}

        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => staffReadyOrderAction(order.id), { status: "READY" })}
          className="flex-1 rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          ✓ Ready
        </button>
      </div>

      {isRejecting && (
        <RejectDialog
          orderNumber={order.orderNumber}
          onClose={() => setRejecting(false)}
          onConfirm={(reason) => {
            setRejecting(false);
            run(() => staffRejectOrderAction(order.id, reason), {
              status: "REJECTED",
              rejectionReason: reason || null,
            });
          }}
        />
      )}
    </article>
  );
}

function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}
