import type { Metadata } from "next";
import { env } from "@/lib/env";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create your restaurant account",
  description:
    "Set up your QR menu and start taking orders. Free plan, no card required.",
};

/**
 * Reads the environment and the chosen plan on the server, so the form
 * itself stays a plain client component.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;
  return (
    <SignUpForm
      plan={plan ?? null}
      appDomain={env.APP_DOMAIN}
      // Hostname only: the owner is reading an address, not a link, and
      // "https://" in front of a form field is noise.
      menuUrlBase={new URL(env.APP_URL).host}
    />
  );
}
