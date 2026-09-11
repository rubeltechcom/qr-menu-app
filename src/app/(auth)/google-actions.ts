"use server";

import { signIn } from "@/lib/auth";

/**
 * Starts the Google sign-in redirect.
 *
 * A Server Action rather than a client-side `signIn()` call so the
 * redirect is issued by the server, which is what makes it work with
 * JavaScript still loading and keeps the flow identical to the
 * credentials form next to it.
 *
 * Both signing up and logging in land here: Google does not distinguish
 * them, and neither does the signIn callback in lib/auth.ts — it
 * creates the account on first use and reuses it afterwards.
 */
export async function googleSignInAction() {
  // No try/catch: signIn throws a redirect by design, and catching it
  // would swallow the navigation. A genuine provider failure surfaces
  // on Google's own page, which is where the user can act on it.
  await signIn("google", { redirectTo: "/dashboard" });
}
