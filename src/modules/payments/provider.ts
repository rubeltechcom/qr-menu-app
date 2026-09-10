/**
 * The payment provider contract (PROMPT.md §2: "Pluggable
 * PaymentProvider interface so bKash / SSLCommerz / Razorpay can be
 * added later without touching order logic").
 *
 * Everything above this interface — the checkout sheet, the order
 * service, the refund button — knows only these five operations. Adding
 * a provider means writing one file that implements this and listing it
 * in registry.ts; no branching in feature code.
 *
 * The shape is deliberately redirect-first rather than card-fields-first,
 * because that is the only shape both providers share: Stripe Checkout
 * and bKash both hand back a URL you send the diner to. A provider that
 * could take card details inline can still implement this; one that
 * cannot could not implement the reverse.
 */

export type ProviderId = "STRIPE" | "BKASH" | "COUNTER";

export interface CreatePaymentParams {
  /** Our own payment row id — passed to the provider so a webhook can find it. */
  paymentId: string;
  orderId: string;
  orderNumber: number;
  /** Minor units. */
  amountCents: number;
  currency: string;
  /** What the platform keeps, in minor units. Zero on paid plans. */
  platformFeeCents: number;
  /** Where the diner lands after paying, or after cancelling. */
  returnUrl: string;
  cancelUrl: string;
  /** The restaurant's connected account, where the money settles. */
  destinationAccountId: string | null;
  restaurantName: string;
  customerEmail?: string;
  customerPhone?: string;
}

export interface CreatePaymentResult {
  /** Send the diner here. */
  redirectUrl: string;
  /** The provider's id for this payment, stored as Payment.providerRef. */
  providerRef: string;
  /** Anything the verify step needs later (bKash needs its paymentID). */
  sessionRef?: string;
}

export type PaymentOutcome =
  | { status: "PAID"; providerRef: string; amountCents: number }
  | { status: "PENDING" }
  | { status: "FAILED"; reason: string }
  | { status: "CANCELLED" };

export interface RefundParams {
  providerRef: string;
  /** Minor units. Must not exceed what remains unrefunded. */
  amountCents: number;
  reason?: string;
  /** bKash needs the original transaction id as well as the payment id. */
  sessionRef?: string | null;
  /** See the note on verifyPayment — Stripe needs this to find the charge. */
  accountId?: string | null;
}

export interface RefundResult {
  providerRef: string;
  amountCents: number;
}

/** A verified, de-duplicated webhook, normalised across providers. */
export interface NormalisedWebhook {
  eventId: string;
  eventType: string;
  /** Our payment row id, when the event concerns one. */
  paymentId?: string;
  outcome?: PaymentOutcome;
  /** Raw payload, stored for support and replay. */
  payload: unknown;
}

export interface PaymentProvider {
  readonly id: ProviderId;
  /** Human name shown to the diner on the checkout sheet. */
  readonly displayName: string;
  /** False when the provider's credentials are not configured. */
  isConfigured(): boolean;

  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;

  /**
   * Ask the provider what actually happened.
   *
   * Called on the return-from-provider redirect, because a redirect is
   * not proof of payment — PROMPT.md §9 is explicit that client-side
   * success must never be trusted. The webhook is the other half; both
   * paths converge on the same outcome and the same idempotent write.
   */
  verifyPayment(params: {
    providerRef: string;
    sessionRef?: string | null;
    /**
     * The restaurant's connected account, when the provider needs it to
     * find the payment at all. Stripe does — a Checkout Session created
     * on a connected account is invisible to a platform-level lookup.
     */
    accountId?: string | null;
  }): Promise<PaymentOutcome>;

  refund(params: RefundParams): Promise<RefundResult>;

  /**
   * Verify the signature on an incoming webhook and normalise it.
   * Returns null when the signature does not check out — the caller
   * responds 400 and never touches the payload.
   */
  parseWebhook(params: {
    rawBody: string;
    headers: Headers;
  }): Promise<NormalisedWebhook | null>;
}
