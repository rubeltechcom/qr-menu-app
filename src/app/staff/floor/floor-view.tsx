"use client";

import { useMemo, useState, useTransition } from "react";
import type { SerializedOrder } from "@/modules/orders/order.service";
import { useLiveOrders } from "@/lib/use-live-orders";
import { useOrderAlerts } from "@/lib/use-order-alerts";
import { StaffHeader } from "@/components/staff/staff-header";
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
  const { announce, isFullyArmed, enableAll } = useOrderAlerts();

  const { orders, connection, patchOrder } = useLiveOrders({
    streamUrl: `/api/staff/realtime?locationId=${encodeURIComponent(locationId)}`,
    resyncUrl: `/api/staff/orders?locationId=${encodeURIComponent(locationId)}`,
    initialOrders,
    onNewOrder: announce,
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

  const waitingCount = orders.filter((order) => order.status === "READY").length;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <StaffHeader
        title="Floor"
        subtitle={
          waitingCount > 0
            ? `${waitingCount} ready to serve`
            : `${tables.length} tables`
        }
        connection={connection}
        isFullyArmed={isFullyArmed}
        onEnableAlerts={() => void enableAll()}
      />

      <div className="px-4 py-5 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Takeaway &amp; delivery
            </h2>
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
  // then free. Read from across the room, so the fill carries the
  // meaning rather than the text.
  const tone = hasReady
    ? "border-green-500 bg-green-50"
    : hasWaiting
      ? "border-amber-400 bg-amber-50"
      : orders.length > 0
        ? "border-zinc-300 bg-white"
        : "border-zinc-200 bg-white";

  const total = orders.reduce((sum, order) => sum + order.totalCents, 0);

  return (
    <div className={`rounded-xl border-2 p-3 shadow-sm transition-colors ${tone}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={orders.length === 0}
        className="w-full text-left disabled:cursor-default"
      >
        <p className={`text-2xl font-bold ${orders.length === 0 ? "text-zinc-400" : "text-zinc-900"}`}>
          {label}
        </p>
        <p className={`mt-0.5 text-sm ${orders.length === 0 ? "text-zinc-400" : "text-zinc-600"}`}>
          {orders.length === 0
            ? "Free"
            : `${orders.length} order${orders.length > 1 ? "s" : ""} · ${money(total)}`}
        </p>
        {hasReady && (
          <p className="mt-1 text-sm font-bold text-green-700">Ready to serve</p>
        )}
      </button>

      {isOpen &&
        orders.map((order) => (
          <div key={order.id} className="mt-3 border-t border-zinc-200 pt-2">
            <p className="text-sm font-semibold text-zinc-900">
              #{order.orderNumber} · {order.status.toLowerCase()}
            </p>
            <ul className="mt-1 flex flex-col gap-0.5 text-sm text-zinc-600">
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
                className="mt-2 w-full rounded-lg bg-green-600 py-2.5 text-base font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
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
      className={`rounded-xl border-2 p-3 shadow-sm ${
        order.status === "READY"
          ? "border-green-500 bg-green-50"
          : "border-zinc-200 bg-white"
      }`}
    >
      <p className="text-lg font-bold text-zinc-900">
        #{order.orderNumber}{" "}
        <span className="text-sm font-medium text-zinc-500">
          {order.type.replace("_", " ")}
        </span>
      </p>
      {order.customerName && (
        <p className="text-sm text-zinc-800">{order.customerName}</p>
      )}
      {order.customerPhone && (
        <p className="text-sm text-zinc-500">{order.customerPhone}</p>
      )}
      {order.deliveryAddress && (
        <p className="mt-1 text-sm text-zinc-600">{order.deliveryAddress}</p>
      )}
      <p className="mt-1 text-sm tabular-nums text-zinc-500">
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
          className="mt-3 w-full rounded-lg bg-green-600 py-2.5 text-base font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
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
