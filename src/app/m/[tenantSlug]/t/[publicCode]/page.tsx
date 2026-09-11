import type { Metadata } from "next";
import {
  StorefrontForTable,
  storefrontMetadata,
} from "@/app/t/[publicCode]/storefront-view";

/**
 * The branded storefront URL: /m/<slug>/t/<code>.
 *
 * A printed QR code shows its URL in readable text underneath, and a
 * guest should see a name they recognise there. A per-restaurant
 * subdomain does that too, but only where DNS is wildcarded and the
 * certificate covers it — which a two-level wildcard usually is not
 * without paying for it. This needs neither: one hostname, one
 * certificate, nothing to configure when a restaurant signs up.
 *
 * The slug is presentation, not authorisation. The code identifies the
 * table; the slug is checked only so it cannot advertise one restaurant
 * and serve another.
 */
export const metadata: Metadata = storefrontMetadata;

export default async function BrandedTableLandingPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; publicCode: string }>;
}) {
  const { tenantSlug, publicCode } = await params;
  return <StorefrontForTable publicCode={publicCode} expectedSlug={tenantSlug} />;
}
