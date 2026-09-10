import type { PaymentProvider, ProviderId } from "./provider";
import { stripeProvider } from "./stripe.provider";
import { bkashProvider } from "./bkash.provider";

/**
 * The one place that knows which providers exist.
 *
 * Adding SSLCommerz or Razorpay means writing a file that implements
 * PaymentProvider and adding it here — nothing in the order or checkout
 * code changes (PROMPT.md §2).
 */
const PROVIDERS: Partial<Record<ProviderId, PaymentProvider>> = {
  STRIPE: stripeProvider,
  BKASH: bkashProvider,
};

export function getProvider(id: ProviderId): PaymentProvider {
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new Error(`Unknown payment provider: ${id}`);
  }
  return provider;
}

/**
 * Providers a diner can actually be offered right now.
 *
 * Filtered by configuration rather than listed statically, so an
 * install with only bKash credentials shows only bKash instead of
 * offering a card button that errors on tap.
 */
export function availableProviders(): PaymentProvider[] {
  return Object.values(PROVIDERS).filter((provider) => provider.isConfigured());
}
