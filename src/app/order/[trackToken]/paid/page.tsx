import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { verifyAndRecord } from "@/modules/payments/payment.service";

/**
 * Where a diner lands after paying.
 *
 * The redirect itself proves nothing — it only means a browser came
 * back. So this page asks the provider what actually happened
 * (PROMPT.md §9: "never trust client-side success redirects") and
 * records the answer through the same idempotent path the webhook uses.
 *
 * For bKash this is not a double-check but the *only* check: bKash has
 * no webhooks, and its `execute` call is what captures the money. If
 * this page never runs, the payment never completes — which is why the
 * verification happens server-side on render rather than in a fetch the
 * diner's browser might abandon.
 */

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ trackToken: string }>;
  searchParams: Promise<{ payment?: string; status?: string }>;
}) {
  const { trackToken } = await params;
  const { payment: paymentId, status } = await searchParams;

  // bKash appends its own status; a cancellation never needs verifying.
  if (status === "cancel" || status === "failure") {
    redirect(`/order/${trackToken}?payment=${status}`);
  }

  if (!paymentId) {
    redirect(`/order/${trackToken}`);
  }

  let outcome: { status: string; reason?: string };
  try {
    outcome = await verifyAndRecord(paymentId);
  } catch (error) {
    // A provider timing out must not leave the diner on an error page
    // with no way back to their order — the webhook (Stripe) or a retry
    // (bKash) can still resolve it, and the tracking page shows the
    // truth either way.
    console.error("[payments] Verification failed on return", error);
    return (
      <PaymentMessage
        trackToken={trackToken}
        title="We couldn't confirm the payment"
        detail="If money left your account, the restaurant will see it shortly. Check your order below."
      />
    );
  }

  if (outcome.status === "PAID") {
    redirect(`/order/${trackToken}?payment=paid`);
  }

  if (outcome.status === "PENDING") {
    return (
      <PaymentMessage
        trackToken={trackToken}
        title="Payment still processing"
        detail="Your bank hasn't confirmed it yet. This page updates as soon as it does."
        refreshSeconds={5}
      />
    );
  }

  return (
    <PaymentMessage
      trackToken={trackToken}
      title="Payment not completed"
      detail={
        "reason" in outcome && outcome.reason
          ? outcome.reason
          : "Nothing was charged. You can try again, or pay at the counter."
      }
    />
  );
}

function PaymentMessage({
  trackToken,
  title,
  detail,
  refreshSeconds,
}: {
  trackToken: string;
  title: string;
  detail: string;
  refreshSeconds?: number;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-6 text-center">
      {refreshSeconds && <meta httpEquiv="refresh" content={String(refreshSeconds)} />}
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{detail}</p>
      <a
        href={`/order/${trackToken}`}
        className="mt-6 rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
      >
        Back to your order
      </a>
    </div>
  );
}
