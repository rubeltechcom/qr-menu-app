import { getBooleanSetting, getSetting } from "@/modules/platform/settings.service";
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
 * bKash Tokenized Checkout.
 *
 * Two things differ from Stripe in ways that shape this file:
 *
 * 1. **bKash has no webhooks.** The only way to learn a payment's fate
 *    is to call `execute` when the diner returns, and `query` if that
 *    call is ambiguous. So verifyPayment() is not a belt-and-braces
 *    second opinion here — it is the primary path, and the reason the
 *    provider interface was built redirect-first.
 *
 * 2. **bKash has no marketplace split.** Money lands in the account
 *    whose credentials are configured; there is no application fee and
 *    no destination account. A platform fee on a bKash order therefore
 *    has to be settled separately, and the checkout service refuses to
 *    quietly pretend otherwise.
 *
 * Amounts: bKash works in whole BDT with two decimal places as a
 * string, so cents are divided by 100 on the way out and multiplied
 * back on the way in — never held as a float in between.
 */

const SANDBOX_BASE = "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout";
const LIVE_BASE = "https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout";

/** Credentials, from the admin panel or the environment. */
function credentials() {
  return {
    appKey: getSetting("bkash.appKey"),
    appSecret: getSetting("bkash.appSecret"),
    username: getSetting("bkash.username"),
    password: getSetting("bkash.password"),
  };
}

function baseUrl(): string {
  // Defaults to sandbox: pointing at live money should be a deliberate
  // act, never something an unset value does for you.
  return getBooleanSetting("bkash.sandbox", true) ? SANDBOX_BASE : LIVE_BASE;
}

/**
 * bKash grant tokens last an hour. Cached in-process rather than
 * re-fetched per payment, because the token endpoint is rate-limited
 * and a busy Friday night would trip it.
 */
let cachedToken: { token: string; expiresAt: number } | null = null;

async function grantToken(): Promise<string> {
  const now = Date.now();
  // Refresh a minute early rather than on the exact boundary, so a
  // request in flight when the token expires does not fail.
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }

  const { appKey, appSecret, username, password } = credentials();
  if (!appKey || !appSecret || !username || !password) {
    throw new Error(
      "bKash is not configured. Add its credentials in the admin settings.",
    );
  }

  const response = await fetch(`${baseUrl()}/token/grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      username,
      password,
    },
    body: JSON.stringify({
      app_key: appKey,
      app_secret: appSecret,
    }),
  });

  const body = (await response.json()) as {
    id_token?: string;
    expires_in?: number;
    statusMessage?: string;
  };

  if (!body.id_token) {
    throw new Error(`bKash token grant failed: ${body.statusMessage ?? response.status}`);
  }

  cachedToken = {
    token: body.id_token,
    expiresAt: now + (body.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

async function bkashFetch<T>(path: string, payload: unknown): Promise<T> {
  const token = await grantToken();
  const response = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: token,
      "X-APP-Key": credentials().appKey ?? "",
    },
    body: JSON.stringify(payload),
  });
  return (await response.json()) as T;
}

/** Minor units to the "123.45" string bKash expects. */
function toBdtAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** bKash's amount string back to minor units, without float drift. */
function fromBdtAmount(amount: string): number {
  return Math.round(Number.parseFloat(amount) * 100);
}

interface BkashCreateResponse {
  paymentID?: string;
  bkashURL?: string;
  statusMessage?: string;
  errorMessage?: string;
}

interface BkashExecuteResponse {
  paymentID?: string;
  trxID?: string;
  transactionStatus?: string;
  amount?: string;
  statusMessage?: string;
  errorMessage?: string;
  errorCode?: string;
}

export const bkashProvider: PaymentProvider = {
  id: "BKASH",
  displayName: "bKash",

  isConfigured() {
    const { appKey, appSecret, username, password } = credentials();
    return Boolean(appKey && appSecret && username && password);
  },

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const body = await bkashFetch<BkashCreateResponse>("/create", {
      mode: "0011", // tokenized checkout, diner redirected to bKash
      payerReference: params.customerPhone ?? String(params.orderNumber),
      callbackURL: params.returnUrl,
      amount: toBdtAmount(params.amountCents),
      currency: params.currency,
      intent: "sale",
      // Our own id, echoed back on execute so the return handler knows
      // which payment row this is without trusting a query parameter.
      merchantInvoiceNumber: params.paymentId,
    });

    if (!body.paymentID || !body.bkashURL) {
      throw new Error(
        `bKash could not start the payment: ${body.errorMessage ?? body.statusMessage ?? "unknown error"}`,
      );
    }

    return {
      redirectUrl: body.bkashURL,
      providerRef: body.paymentID,
      sessionRef: body.paymentID,
    };
  },

  /**
   * bKash's `execute` is what actually captures the money, and it is
   * only valid once. Calling it twice returns an error rather than a
   * second charge, so a diner who refreshes the return page falls
   * through to `query` below and still gets the right answer.
   */
  async verifyPayment({ providerRef }): Promise<PaymentOutcome> {
    const executed = await bkashFetch<BkashExecuteResponse>("/execute", {
      paymentID: providerRef,
    });

    if (executed.transactionStatus === "Completed" && executed.amount) {
      return {
        status: "PAID",
        providerRef: executed.trxID ?? providerRef,
        amountCents: fromBdtAmount(executed.amount),
      };
    }

    // Execute did not give a clean answer — most often because it has
    // already been called. Ask what the payment's actual state is.
    const queried = await bkashFetch<BkashExecuteResponse>("/payment/status", {
      paymentID: providerRef,
    });

    switch (queried.transactionStatus) {
      case "Completed":
        return {
          status: "PAID",
          providerRef: queried.trxID ?? providerRef,
          amountCents: queried.amount ? fromBdtAmount(queried.amount) : 0,
        };
      case "Initiated":
        return { status: "PENDING" };
      case "Cancelled":
        return { status: "CANCELLED" };
      default:
        return {
          status: "FAILED",
          reason:
            queried.errorMessage ??
            executed.errorMessage ??
            queried.statusMessage ??
            "bKash did not complete the payment.",
        };
    }
  },

  async refund(params: RefundParams): Promise<RefundResult> {
    // bKash refunds need BOTH the payment id and the transaction id it
    // produced, which is why RefundParams carries sessionRef.
    if (!params.sessionRef) {
      throw new Error("A bKash refund needs the original payment id.");
    }

    const body = await bkashFetch<{
      refundTrxID?: string;
      errorMessage?: string;
      statusMessage?: string;
    }>("/payment/refund", {
      paymentID: params.sessionRef,
      trxID: params.providerRef,
      amount: toBdtAmount(params.amountCents),
      sku: "order",
      reason: params.reason ?? "Refund",
    });

    if (!body.refundTrxID) {
      throw new Error(
        `bKash refused the refund: ${body.errorMessage ?? body.statusMessage ?? "unknown error"}`,
      );
    }

    return { providerRef: body.refundTrxID, amountCents: params.amountCents };
  },

  /**
   * bKash does not send webhooks. Returning null means the webhook
   * route rejects anything claiming to be from bKash, rather than
   * accepting an unsigned payload that could move an order to PAID.
   */
  async parseWebhook(): Promise<NormalisedWebhook | null> {
    return null;
  },
};
