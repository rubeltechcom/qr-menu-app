"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { SerializedOrder } from "@/modules/orders/order.service";
import { useOrderSound } from "@/lib/use-order-sound";
import { useLiveOrders } from "@/lib/use-live-orders";
import {
  acceptOrderAction,
  completeOrderAction,
  readyOrderAction,
  rejectOrderAction,
} from "./actions";
import { markPaidAtCounterAction, refundOrderAction } from "./payment-actions";

type TypeFilter = "ALL" | "DINE_IN" | "TAKEAWAY" | "DELIVERY";

const TYPE_TABS: Array<{ value: TypeFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "DINE_IN", label: "Dine In" },
  { value: "TAKEAWAY", label: "Takeaway" },
  { value: "DELIVERY", label: "Delivery" },
];

const TYPE_LABEL: Record<SerializedOrder["type"], string> = {
  DINE_IN: "DINE IN",
  TAKEAWAY: "TAKEAWAY",
  DELIVERY: "DELIVERY",
};

const RESOLVED: Array<SerializedOrder["status"]> = ["READY", "COMPLETED", "REJECTED"];

export function OrderBoard({
  tenantSlug,
  locationId,
  currency,
  initialOrders,
}: {
  tenantSlug: string;
  locationId: string;
  currency: string;
  initialOrders: SerializedOrder[];
}) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [hideCompleted, setHideCompleted] = useState(true);
  const { isArmed, arm, play } = useOrderSound();

  const notify = useCallback(
    (order: SerializedOrder) => {
      play();
      showDesktopNotification(order);
    },
    [play],
  );

  const { orders, connection, patchOrder } = useLiveOrders({
    streamUrl: `/api/realtime/orders?tenant=${encodeURIComponent(tenantSlug)}&locationId=${encodeURIComponent(locationId)}`,
    resyncUrl: `/api/admin/orders?tenant=${encodeURIComponent(tenantSlug)}&locationId=${encodeURIComponent(locationId)}`,
    initialOrders,
    onNewOrder: notify,
  });

  const visible = useMemo(() => {
    return orders
      .filter((order) => (typeFilter === "ALL" ? true : order.type === typeFilter))
      .filter((order) => (hideCompleted ? !RESOLVED.includes(order.status) : true));
  }, [orders, typeFilter, hideCompleted]);

  const openCount = orders.filter((order) => order.status === "PENDING").length;

  // Mirror the pending count in the tab title, so a kitchen with the
  // board in a background tab still sees that something is waiting.
  useEffect(() => {
    const base = "Orders";
    document.title = openCount > 0 ? `(${openCount}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [openCount]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Orders
        </h1>
        <ConnectionBadge state={connection} />
      </header>

      {!isArmed && (
        // The autoplay unlock. Browsers block programmatic audio until a
        // real gesture, so this link is functional, not decorative.
        <button
          type="button"
          onClick={() => void arm()}
          className="mt-4 text-sm font-medium text-red-600 underline underline-offset-2 hover:text-red-700 dark:text-red-400"
        >
          Click here to enable sound for new orders
        </button>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <div className="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={typeFilter === tab.value}
              onClick={() => setTypeFilter(tab.value)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                typeFilter === tab.value
                  ? "bg-blue-600 text-white"
                  : "bg-transparent text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={hideCompleted}
            onChange={(event) => setHideCompleted(event.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
          />
          hide done
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="mt-16 text-center text-lg text-zinc-500 dark:text-zinc-400">
          No Orders
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {visible.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              tenantSlug={tenantSlug}
              currency={currency}
              onOptimistic={patchOrder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectionBadge({ state }: { state: "connecting" | "live" | "offline" }) {
  const copy = {
    connecting: { label: "Connecting…", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
    live: { label: "Live", dot: "bg-green-500", text: "text-green-700 dark:text-green-400" },
    offline: {
      label: "Reconnecting — still checking for orders",
      dot: "bg-red-500",
      text: "text-red-700 dark:text-red-400",
    },
  }[state];

  return (
    <span className={`flex items-center gap-2 text-sm font-medium ${copy.text}`}>
      <span className={`h-2 w-2 rounded-full ${copy.dot}`} aria-hidden />
      {copy.label}
    </span>
  );
}

function OrderCard({
  order,
  tenantSlug,
  currency,
  onOptimistic,
}: {
  order: SerializedOrder;
  tenantSlug: string;
  currency: string;
  onOptimistic: (id: string, changes: Partial<SerializedOrder>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const isResolved = RESOLVED.includes(order.status);

  const run = (
    action: () => Promise<void>,
    optimistic: Partial<SerializedOrder>,
  ) => {
    onOptimistic(order.id, optimistic);
    startTransition(() => {
      void action().catch(() => {
        // The server rejected it (already resolved elsewhere, most
        // likely). The next re-sync restores the true state, so revert
        // rather than leaving a wrong status on screen.
        onOptimistic(order.id, { status: order.status });
      });
    });
  };

  return (
    <article
      className={`rounded-xl border p-4 transition-opacity ${
        isResolved
          ? "border-zinc-200 opacity-60 dark:border-zinc-800"
          : "border-zinc-300 dark:border-zinc-700"
      } ${isPending ? "opacity-50" : ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
          {TYPE_LABEL[order.type]} #{order.orderNumber}
          {order.tableLabel && (
            <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
              Table {order.tableLabel}
            </span>
          )}
        </h2>
        <span className="text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
          {formatTime(order.createdAt)}
          {order.scheduledFor && ` · for ${formatTime(order.scheduledFor)}`}
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-1">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-4 text-sm">
            <span className="text-zinc-800 dark:text-zinc-200">
              {item.quantity} × {item.name}
              {item.note && (
                <span className="ml-2 text-zinc-500 dark:text-zinc-400">({item.note})</span>
              )}
            </span>
            <span className="shrink-0 text-zinc-600 tabular-nums dark:text-zinc-400">
              {formatMoney(item.lineTotalCents, currency)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-zinc-200 pt-2 text-right font-semibold text-zinc-900 tabular-nums dark:border-zinc-800 dark:text-zinc-50">
        {formatMoney(order.totalCents, currency)}
      </p>

      {order.note && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          ⚠ {order.note}
        </p>
      )}

      {(order.type === "TAKEAWAY" || order.type === "DELIVERY") && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {order.customerName && <Detail label="Name" value={order.customerName} />}
          {order.customerPhone && <Detail label="Phone" value={order.customerPhone} />}
          {order.customerEmail && <Detail label="Email" value={order.customerEmail} />}
          {order.deliveryAddress && <Detail label="Address" value={order.deliveryAddress} />}
        </dl>
      )}

      <PaymentRow
        order={order}
        tenantSlug={tenantSlug}
        currency={currency}
        disabled={isPending}
      />

      {order.status === "REJECTED" ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          Rejected{order.rejectionReason ? ` — ${order.rejectionReason}` : ""}
        </p>
      ) : order.status === "READY" || order.status === "COMPLETED" ? (
        <p className="mt-3 text-sm text-green-700 dark:text-green-400">
          {order.status === "READY" ? "Ready" : "Completed"}
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              const reason = prompt("Why are you rejecting this order? (optional)");
              // prompt returns null on Cancel — don't reject in that case.
              if (reason === null) return;
              run(
                () => rejectOrderAction(tenantSlug, order.id, reason),
                { status: "REJECTED", rejectionReason: reason || null },
              );
            }}
            className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            ✕ Reject
          </button>

          {order.status === "PENDING" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(() => acceptOrderAction(tenantSlug, order.id), { status: "ACCEPTED" })
              }
              className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-semibold text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200"
            >
              Accept
            </button>
          )}

          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(() => readyOrderAction(tenantSlug, order.id), { status: "READY" })
            }
            className="rounded-full bg-green-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            ✓ Ready
          </button>
        </div>
      )}

      {order.status === "READY" && (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            run(() => completeOrderAction(tenantSlug, order.id), { status: "COMPLETED" })
          }
          className="mt-3 text-sm font-medium text-zinc-500 underline underline-offset-2 disabled:opacity-50 dark:text-zinc-400"
        >
          Mark handed over
        </button>
      )}
    </article>
  );
}

/**
 * Payment state, and the two things staff can do about it: take cash at
 * the counter, or send an online payment back.
 */
function PaymentRow({
  order,
  tenantSlug,
  currency,
  disabled,
}: {
  order: SerializedOrder;
  tenantSlug: string;
  currency: string;
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const payment = order.payment;
  const busy = disabled || isPending;

  const tone =
    order.paymentStatus === "PAID"
      ? "text-green-700 dark:text-green-400"
      : order.paymentStatus === "FAILED"
        ? "text-red-600 dark:text-red-400"
        : order.paymentStatus === "REFUNDED" || order.paymentStatus === "PARTIALLY_REFUNDED"
          ? "text-amber-700 dark:text-amber-400"
          : "text-zinc-500 dark:text-zinc-400";

  const label =
    order.paymentStatus === "PAID"
      ? `Paid${payment ? ` · ${providerLabel(payment.provider)}` : ""}`
      : order.paymentStatus === "REFUNDED"
        ? "Refunded"
        : order.paymentStatus === "PARTIALLY_REFUNDED" && payment
          ? `Partly refunded · ${formatMoney(payment.refundedCents, currency)}`
          : order.paymentStatus === "FAILED"
            ? `Payment failed${payment?.failureReason ? ` · ${payment.failureReason}` : ""}`
            : "Unpaid";

  const canRefund =
    payment !== null &&
    payment.provider !== "COUNTER" &&
    (order.paymentStatus === "PAID" || order.paymentStatus === "PARTIALLY_REFUNDED");

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-2 dark:border-zinc-800">
      <span className={`text-sm font-medium ${tone}`}>{label}</span>

      {order.paymentStatus !== "PAID" &&
        order.paymentStatus !== "REFUNDED" &&
        order.paymentStatus !== "PARTIALLY_REFUNDED" && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              startTransition(() => {
                void markPaidAtCounterAction(tenantSlug, order.id);
              })
            }
            className="text-xs font-medium text-zinc-600 underline underline-offset-2 disabled:opacity-50 dark:text-zinc-400"
          >
            Mark paid at counter
          </button>
        )}

      {canRefund && payment && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const remaining = payment.amountCents - payment.refundedCents;
            if (
              !confirm(
                `Refund ${formatMoney(remaining, currency)} to the diner?

This cannot be undone.`,
              )
            ) {
              return;
            }
            const reason = prompt("Reason for the refund (optional)") ?? "";
            startTransition(() => {
              void refundOrderAction(tenantSlug, payment.id, reason);
            });
          }}
          className="text-xs font-medium text-red-600 underline underline-offset-2 disabled:opacity-50 dark:text-red-400"
        >
          Refund
        </button>
      )}
    </div>
  );
}

function providerLabel(provider: string): string {
  return provider === "BKASH" ? "bKash" : provider === "COUNTER" ? "counter" : "card";
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-zinc-800 dark:text-zinc-200">{value}</dd>
    </>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
      cents / 100,
    );
  } catch {
    // An unrecognised currency code must not blank out the total.
    return (cents / 100).toFixed(2);
  }
}

/**
 * Desktop notification, so a kitchen with the board behind another
 * window still finds out. Permission is requested on the first new order
 * rather than on page load — asking before the staff have seen why is
 * the pattern browsers now penalise.
 */
function showDesktopNotification(order: SerializedOrder) {
  if (typeof Notification === "undefined") return;

  const show = () => {
    try {
      new Notification("New order received", {
        body: `${TYPE_LABEL[order.type]} #${order.orderNumber}`,
        tag: order.id,
      });
    } catch {
      // Some browsers throw on constructing Notification outside a
      // service worker; the sound and on-screen card still fire.
    }
  };

  if (Notification.permission === "granted") {
    show();
  } else if (Notification.permission !== "denied") {
    void Notification.requestPermission().then((result) => {
      if (result === "granted") show();
    });
  }
}
