"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import type { SerializedOrder } from "@/modules/orders/order.service";
import { useLiveOrders } from "@/lib/use-live-orders";
import { useOrderSound } from "@/lib/use-order-sound";
import { staffCompleteOrderAction } from "../kitchen/actions";

interface TableView {
  id: string;
  label: string;
}

/**
 * Waiter floor view (PROMPT.md §6.3).
 *
 * Organised by table rather than by order, because that is how a waiter
 * thinks: they walk the room, not a queue. Every table is shown —
 * including the quiet ones — so the view doubles as a map of the floor
 * rather than just a list of what is outstanding.
 */
export function FloorView({
  locationId,
  tables,
  initialOrders,
  currency,
}: {
  locationId: string;
  tables: TableView[];
  initialOrders: SerializedOrder[];
  currency: string;
}) {
  const { isArmed, arm, play } = useOrderSound();
  const notify = useCallback(() => play(), [play]);

  const { orders, connection, patchOrder } = useLiveOrders({
    streamUrl: `/api/staff/realtime?locationId=${encodeURIComponent(locationId)}`,
    resyncUrl: `/api/staff/orders?locationId=${encodeURIComponent(locationId)}`,
    initialOrders,
    onNewOrder: notify,
  });

  const money = useMemo(() => makeMoneyFormatter(currency), [currency]);

  // Group by table label. Takeaway and delivery have no table, so they
  // get their own column rather than being dropped.
  const byTable = useMemo(() => {
    const map = new Map<string, SerializedOrder[]>();
    for (const order of orders) {
      if (order.status === "COMPLETED" || order.status === "REJECTED") continue;
      const key = order.tableLabel ?? "__counter__";
      const list = map.get(key) ?? [];
      list.push(order);
      map.set(key, list);
    }
    return map;
  }, [orders]);

  const counterOrders = byTable.get("__counter__") ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-5 text-zinc-50">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Floor</h1>
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
          <span className="text-base text-zinc-300">
            {connection === "live"
              ? "Live"
              : connection === "connecting"
                ? "Connecting"
                : "Reconnecting"}
          </span>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tables.map((table) => (
          <TableTile
            key={table.id}
            label={table.label}
            orders={byTable.get(table.label) ?? []}
            money={money}
            onOptimistic={patchOrder}
          />
        ))}
      </div>

      {counterOrders.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-300">Takeaway &amp; delivery</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {counterOrders.map((order) => (
              <CounterCard
                key={order.id}
                order={order}
                money={money}
                onOptimistic={patchOrder}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TableTile({
  label,
  orders,
  money,
  onOptimistic,
}: {
  label: string;
  orders: SerializedOrder[];
  money: (cents: number) => string;
  onOptimistic: (id: string, changes: Partial<SerializedOrder>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isOpen, setOpen] = useState(false);

  const hasReady = orders.some((order) => order.status === "READY");
  const hasWaiting = orders.some((order) => order.status === "PENDING");

  // Colour says what the waiter should do, in priority order: something
  // to carry out, then something the kitchen has not started, then busy,
  // then free.
  const tone = hasReady
    ? "border-green-500 bg-green-950"
    : hasWaiting
      ? "border-amber-500 bg-amber-950"
      : orders.length > 0
        ? "border-zinc-600 bg-zinc-900"
        : "border-zinc-800 bg-zinc-900/40 text-zinc-500";

  const total = orders.reduce((sum, order) => sum + order.totalCents, 0);

  return (
    <div className={`rounded-xl border-2 p-3 ${tone}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={orders.length === 0}
        className="w-full text-left disabled:cursor-default"
      >
        <p className="text-xl font-bold">{label}</p>
        <p className="mt-0.5 text-sm">
          {orders.length === 0
            ? "Free"
            : `${orders.length} order${orders.length > 1 ? "s" : ""} · ${money(total)}`}
        </p>
        {hasReady && (
          <p className="mt-1 text-sm font-semibold text-green-300">Ready to serve</p>
        )}
      </button>

      {isOpen &&
        orders.map((order) => (
          <div key={order.id} className="mt-3 border-t border-white/10 pt-2">
            <p className="text-sm font-semibold">
              #{order.orderNumber} · {order.status.toLowerCase()}
            </p>
            <ul className="mt-1 flex flex-col gap-0.5 text-sm text-zinc-300">
              {order.items.map((item) => (
                <li key={item.id}>
                  {item.quantity}× {item.name}
                </li>
              ))}
            </ul>
            {order.status === "READY" && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  onOptimistic(order.id, { status: "COMPLETED" });
                  startTransition(() => {
                    void staffCompleteOrderAction(order.id).catch(() => {
                      onOptimistic(order.id, { status: order.status });
                    });
                  });
                }}
                className="mt-2 w-full rounded-lg bg-green-600 py-2 text-base font-semibold disabled:opacity-50"
              >
                Served
              </button>
            )}
          </div>
        ))}
    </div>
  );
}

function CounterCard({
  order,
  money,
  onOptimistic,
}: {
  order: SerializedOrder;
  money: (cents: number) => string;
  onOptimistic: (id: string, changes: Partial<SerializedOrder>) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div
      className={`rounded-xl border-2 p-3 ${
        order.status === "READY"
          ? "border-green-500 bg-green-950"
          : "border-zinc-700 bg-zinc-900"
      }`}
    >
      <p className="text-lg font-bold">
        #{order.orderNumber}{" "}
        <span className="text-sm font-medium text-zinc-400">
          {order.type.replace("_", " ")}
        </span>
      </p>
      {order.customerName && <p className="text-sm">{order.customerName}</p>}
      {order.customerPhone && (
        <p className="text-sm text-zinc-400">{order.customerPhone}</p>
      )}
      {order.deliveryAddress && (
        <p className="mt-1 text-sm text-zinc-300">{order.deliveryAddress}</p>
      )}
      <p className="mt-1 text-sm tabular-nums text-zinc-400">
        {money(order.totalCents)}
      </p>

      {order.status === "READY" && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            onOptimistic(order.id, { status: "COMPLETED" });
            startTransition(() => {
              void staffCompleteOrderAction(order.id).catch(() => {
                onOptimistic(order.id, { status: order.status });
              });
            });
          }}
          className="mt-3 w-full rounded-lg bg-green-600 py-2 text-base font-semibold disabled:opacity-50"
        >
          Handed over
        </button>
      )}
    </div>
  );
}

function makeMoneyFormatter(currency: string) {
  let format: Intl.NumberFormat | null = null;
  try {
    format = new Intl.NumberFormat(undefined, { style: "currency", currency });
  } catch {
    // Unrecognised code — fall through to a plain amount.
  }
  return (cents: number) =>
    format ? format.format(cents / 100) : (cents / 100).toFixed(2);
}
