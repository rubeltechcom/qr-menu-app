import Stripe from "stripe";
import { getSetting } from "@/modules/platform/settings.service";

/**
 * The one place that builds a Stripe client.
 *
 * Four modules need one — payments, billing, Connect onboarding and the
 * billing webhook — and the key can now be changed from the admin panel
 * at runtime. Centralising it means a saved key takes effect everywhere
 * at once, instead of three cached clients holding the old one.
 */

let client: Stripe | null = null;
let clientKey: string | null = null;

/** The configured secret key, from the admin settings or the env. */
export function stripeSecretKey(): string | undefined {
  return getSetting("stripe.secretKey");
}

export function isStripeConfigured(): boolean {
  return Boolean(stripeSecretKey());
}

/**
 * A client for the current key, rebuilt when the key changes so a
 * change in the admin panel does not need a redeploy.
 */
export function stripeClient(): Stripe {
  const key = stripeSecretKey();
  if (!key) {
    throw new Error("Stripe is not configured. Add a secret key in the admin settings.");
  }
  if (!client || clientKey !== key) {
    client = new Stripe(key);
    clientKey = key;
  }
  return client;
}
