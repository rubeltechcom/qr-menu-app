import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { trackOrder } from "@/modules/orders/order.service";
import { StatusCard } from "./status-card";

/**
 * The diner's view of their own order.
 *
 * Reached by an unguessable token rather than a login, for the same
 * reason a table's QR code works that way: diners are anonymous, and
 * forcing a signup to see "your food is coming" would be absurd.
 *
 * Rendered on the server with the status as it stands, then kept current
 * by StatusCard polling /api/orders/<token>/status. It used to rely on a
 * `<meta http-equiv="refresh">`, which browsers ignore when React
 * inserts it after hydration — so the status sat frozen until the diner
 * pulled to refresh, which is exactly what they should never have to do.
 */

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

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

  return (
    <div className="min-h-screen bg-zinc-50 pb-16">
      <div className="mx-auto w-full max-w-lg px-5 pt-10">
        <StatusCard
          trackToken={trackToken}
          initialStatus={order.status}
          initialRejectionReason={order.rejectionReason}
          createdAt={order.createdAt.toISOString()}
          orderNumber={order.orderNumber}
          tableLabel={order.table?.label ?? null}
        >
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
        </StatusCard>
      </div>
    </div>
  );
}
