import type { Metadata } from "next";
import { StorefrontForTable, storefrontMetadata } from "./storefront-view";

/**
 * The QR landing page — what a diner sees the instant they scan a table.
 *
 * The bare form, carrying only the table code. Still the canonical URL
 * for a restaurant on its own custom domain, and the fallback everywhere
 * else; the branded /m/<slug>/t/<code> renders the same view.
 */
export const metadata: Metadata = storefrontMetadata;

export default async function TableLandingPage({
  params,
}: {
  params: Promise<{ publicCode: string }>;
}) {
  const { publicCode } = await params;
  return <StorefrontForTable publicCode={publicCode} />;
}
