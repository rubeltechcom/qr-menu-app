import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { trackOrder } from "@/modules/orders/order.service";

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
  },
  ACCEPTED: { title: "Being prepared", detail: "The kitchen is working on your order." },
  READY: { title: "Ready", detail: "Your order is ready." },
  COMPLETED: { title: "Served", detail: "Enjoy your meal." },
  REJECTED: {
    title: "Not accepted",
    detail: "The restaurant could not take this order.",
  },
} as const;

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

  return (
    <div className="mx-auto min-h-screen w-full max-w-lg bg-white px-6 py-12">
      {/* No JS needed: the page re-fetches itself while the order is
          still in progress, and stops once it is resolved. */}
      {(order.status === "PENDING" || order.status === "ACCEPTED") && (
        <meta httpEquiv="refresh" content="15" />
      )}

      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
        Order #{order.orderNumber}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
        {copy.title}
      </h1>
      <p className="mt-2 text-zinc-600">{copy.detail}</p>

      {order.status === "REJECTED" && order.rejectionReason && (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {order.rejectionReason}
        </p>
      )}

      <ul className="mt-8 flex flex-col gap-2 border-t border-zinc-200 pt-4">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-4 text-sm">
            <span className="text-zinc-800">
              {item.quantity} × {item.nameSnapshot}
            </span>
            <span className="shrink-0 text-zinc-600 tabular-nums">
              {(item.lineTotalCents / 100).toFixed(2)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 flex justify-between border-t border-zinc-200 pt-3 font-semibold text-zinc-900">
        <span>Total</span>
        <span className="tabular-nums">{(order.totalCents / 100).toFixed(2)}</span>
      </p>
    </div>
  );
}
