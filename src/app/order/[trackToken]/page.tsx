import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { trackOrder } from "@/modules/orders/order.service";
import { ElapsedTime, ProgressRail } from "./order-progress";

/**
 * The diner's view of their own order.
 *
 * Reached by an unguessable token rather than a login, for the same
 * reason a table's QR code works that way: diners are anonymous, and
 * forcing a signup to see "your food is coming" would be absurd.
 *
 * Auto-refreshes rather than holding an SSE connection: a phone in a
 * pocket suspends the tab constantly, and a stream that silently dies is
 * worse than a poll that always catches up.
 */

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STATUS_COPY = {
  PENDING: {
    title: "Sent to the kitchen",
    detail: "Waiting for the kitchen to accept it.",
    emoji: "📨",
  },
  ACCEPTED: {
    title: "Being prepared",
    detail: "The kitchen is working on your order.",
    emoji: "👨‍🍳",
  },
  READY: { title: "Ready", detail: "Your order is ready.", emoji: "🔔" },
  COMPLETED: { title: "Served", detail: "Enjoy your meal.", emoji: "🍽️" },
  REJECTED: {
    title: "Not accepted",
    detail: "The restaurant could not take this order.",
    emoji: "😔",
  },
} as const;

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
      cents / 100,
    );
  } catch {
    // An unrecognised currency code must not blank out the total.
    return (cents / 100).toFixed(2);
  }
}

export default async function TrackOrderPage({
  params,
}: {
  params: Promise<{ trackToken: string }>;
}) {
  const { trackToken } = await params;

  // The token is the credential and carries no tenant; trackOrder()
  // resolves the owning tenant from it and then reads scoped.
  const order = await trackOrder(trackToken);
  if (!order) notFound();

  const copy = STATUS_COPY[order.status];
  const isOpen = order.status === "PENDING" || order.status === "ACCEPTED";
  const isRejected = order.status === "REJECTED";

  return (
    <div className="min-h-screen bg-zinc-50 pb-16">
      {/* No JS needed for the refresh: the page re-fetches itself while
          the order is still in progress, and stops once it is resolved. */}
      {isOpen && <meta httpEquiv="refresh" content="15" />}

      <div className="mx-auto w-full max-w-lg px-5 pt-10">
        <div
          className={`rounded-2xl border p-6 text-center shadow-sm ${
            isRejected ? "border-red-200 bg-red-50" : "border-zinc-200 bg-white"
          }`}
        >
          <span className="text-5xl" aria-hidden>
            {copy.emoji}
          </span>

          <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900">
            {copy.title}
          </h1>
          <p className="mt-1 text-zinc-600">{copy.detail}</p>

          <p className="mt-4 text-sm text-zinc-500">
            Order #{order.orderNumber}
            {order.table?.label && ` · Table ${order.table.label}`}
          </p>

          {/* Only while it is still cooking: once served, how long it
              took stops being the useful number. */}
          {isOpen && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700">
              <span aria-hidden>⏱</span>
              <ElapsedTime since={order.createdAt.toISOString()} />
            </p>
          )}

          {isRejected && order.rejectionReason && (
            <p className="mt-4 rounded-lg bg-white px-4 py-3 text-sm text-red-800">
              {order.rejectionReason}
            </p>
          )}
        </div>

        {!isRejected && (
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <ProgressRail status={order.status} />
          </div>
        )}

        {order.scheduledFor && (
          <p className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-center text-sm font-medium text-blue-900">
            Scheduled for{" "}
            {order.scheduledFor.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
            Your order
          </h2>

          <ul className="mt-4 flex flex-col gap-3">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-4 text-sm">
                <span className="text-zinc-800">
                  <span className="font-semibold tabular-nums">{item.quantity}×</span>{" "}
                  {item.nameSnapshot}
                  {item.note && (
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {item.note}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-zinc-600 tabular-nums">
                  {formatMoney(item.lineTotalCents, order.currency)}
                </span>
              </li>
            ))}
          </ul>

          {order.deliveryFeeCents > 0 && (
            <p className="mt-4 flex justify-between border-t border-dashed border-zinc-200 pt-3 text-sm text-zinc-600">
              <span>Delivery</span>
              <span className="tabular-nums">
                {formatMoney(order.deliveryFeeCents, order.currency)}
              </span>
            </p>
          )}

          <p className="mt-3 flex justify-between border-t border-zinc-200 pt-3 text-lg font-bold text-zinc-900">
            <span>Total</span>
            <span className="tabular-nums">
              {formatMoney(order.totalCents, order.currency)}
            </span>
          </p>
        </div>

        {isOpen && (
          <p className="mt-6 text-center text-xs text-zinc-400">
            This page updates on its own — no need to refresh.
          </p>
        )}
      </div>
    </div>
  );
}
