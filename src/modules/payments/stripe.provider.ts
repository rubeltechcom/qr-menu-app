import Stripe from "stripe";
import { getSetting } from "@/modules/platform/settings.service";
import type {
  CreatePaymentParams,
  CreatePaymentResult,
  NormalisedWebhook,
  PaymentOutcome,
  PaymentProvider,
  RefundParams,
  RefundResult,
} from "./provider";

/**
 * Stripe, via Checkout Sessions on a connected account.
 *
 * Funds settle directly to the restaurant's Connect account and the
 * platform takes an application fee (PROMPT.md §2), so the platform
 * never holds a restaurant's money — which keeps us out of a whole
 * category of regulatory and refund-liability problems.
 */

let client: Stripe | null = null;
let clientKey: string | null = null;

/** The key in use, from the admin panel or the environment. */
function secretKey(): string | undefined {
  return getSetting("stripe.secretKey");
}

function stripe(): Stripe {
  const key = secretKey();
  if (!key) {
    throw new Error("Stripe is not configured. Add a secret key in the admin settings.");
  }
  // Rebuilt when the key changes, so saving a new key in the admin
  // panel takes effect without a redeploy.
  if (!client || clientKey !== key) {
    client = new Stripe(key);
    clientKey = key;
  }
  return client;
}

export const stripeProvider: PaymentProvider = {
  id: "STRIPE",
  displayName: "Card",

  isConfigured() {
    return Boolean(secretKey());
  },

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    if (!params.destinationAccountId) {
      throw new Error(
        "This restaurant has not finished connecting its Stripe account yet.",
      );
    }

    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: params.currency.toLowerCase(),
              unit_amount: params.amountCents,
              product_data: {
                name: `${params.restaurantName} — order #${params.orderNumber}`,
              },
            },
          },
        ],
        payment_intent_data: {
          // The platform's cut. Zero on paid plans, so this is only set
          // when there is actually a fee to take.
          ...(params.platformFeeCents > 0
            ? { application_fee_amount: params.platformFeeCents }
            : {}),
          // Repeated on the intent because payment_intent.payment_failed
          // carries the intent, not the session — without this the
          // failure webhook could not find our payment row.
          metadata: { paymentId: params.paymentId, orderId: params.orderId },
        },
        customer_email: params.customerEmail,
        // Echoed back on session webhooks so they can find the row
        // without a lookup table.
        metadata: { paymentId: params.paymentId, orderId: params.orderId },
        success_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
      // Charge on behalf of the restaurant's account.
      { stripeAccount: params.destinationAccountId },
    );

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    return { redirectUrl: session.url, providerRef: session.id };
  },

  async verifyPayment({ providerRef, accountId }): Promise<PaymentOutcome> {
    // A session created on a connected account is only visible when the
    // lookup names that account too.
    const session = await stripe().checkout.sessions.retrieve(
      providerRef,
      undefined,
      accountId ? { stripeAccount: accountId } : undefined,
    );

    if (session.payment_status === "paid") {
      return {
        status: "PAID",
        providerRef,
        amountCents: session.amount_total ?? 0,
      };
    }
    if (session.status === "expired") return { status: "CANCELLED" };
    return { status: "PENDING" };
  },

  async refund(params: RefundParams): Promise<RefundResult> {
    // providerRef is a Checkout Session id; the refund goes against the
    // PaymentIntent behind it.
    const onAccount = params.accountId ? { stripeAccount: params.accountId } : undefined;
    const session = await stripe().checkout.sessions.retrieve(
      params.providerRef,
      undefined,
      onAccount,
    );
    const intentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;

    if (!intentId) {
      throw new Error("That payment has no Stripe PaymentIntent to refund.");
    }

    const refund = await stripe().refunds.create(
      {
        payment_intent: intentId,
        amount: params.amountCents,
        // The application fee goes back too, so a refunded order does
        // not leave the platform holding a cut of money the diner no
        // longer paid.
        refund_application_fee: true,
        ...(params.reason ? { metadata: { reason: params.reason } } : {}),
      },
      onAccount,
    );

    return { providerRef: refund.id, amountCents: params.amountCents };
  },

  async parseWebhook({ rawBody, headers }): Promise<NormalisedWebhook | null> {
    const webhookSecret = getSetting("stripe.webhookSecret");
    if (!webhookSecret) return null;

    const signature = headers.get("stripe-signature");
    if (!signature) return null;

    let event: Stripe.Event;
    try {
      // Signature verification against the RAW body — parsing first
      // would change the bytes and break the check.
      event = stripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
      // Bad signature: the caller responds 400 without touching it.
      return null;
    }

    const base = { eventId: event.id, eventType: event.type, payload: event };

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        return {
          ...base,
          paymentId: session.metadata?.paymentId,
          outcome:
            session.payment_status === "paid"
              ? {
                  status: "PAID",
                  providerRef: session.id,
                  amountCents: session.amount_total ?? 0,
                }
              : { status: "PENDING" },
        };
      }

      case "checkout.session.expired": {
        const session = event.data.object;
        return {
          ...base,
          paymentId: session.metadata?.paymentId,
          outcome: { status: "CANCELLED" },
        };
      }

      case "payment_intent.payment_failed": {
        const intent = event.data.object;
        return {
          ...base,
          paymentId: intent.metadata?.paymentId,
          outcome: {
            status: "FAILED",
            reason: intent.last_payment_error?.message ?? "Payment failed.",
          },
        };
      }

      default:
        // Recorded for the dedupe table and for support to read, but
        // carries no outcome — subscription events are handled by the
        // billing webhook, not this one.
        return base;
    }
  },
};
