import QRCode from "qrcode";
import { env } from "@/lib/env";

/**
 * A table's QR code encodes the storefront URL a diner lands on when they
 * scan it. The code itself is only the publicCode — see public-code.ts for
 * why that is separate from the table's human label.
 */

export interface StorefrontUrlOptions {
  /** The restaurant's slug, which becomes its subdomain. */
  tenantSlug?: string;
  /** A verified custom domain, which wins over the subdomain. */
  customDomain?: string | null;
}

/**
 * Where a scanned table code sends a diner.
 *
 * Preference order, best first:
 *
 *   1. the restaurant's own domain   menu.joespizza.com/t/AB12
 *   2. its subdomain on the platform joespizza.example.com/t/AB12
 *   3. a branded path                example.com/m/joespizza/t/AB12
 *   4. the bare platform URL         example.com/t/AB12
 *
 * A printed QR code carries its URL in human-readable text underneath,
 * and a guest reading it should see a name they recognise rather than
 * ours. The first three all achieve that.
 *
 * The subdomain is skipped unless APP_DOMAIN is set, because it only
 * works where DNS is actually wildcarded and the certificate covers it.
 * Handing out <slug>.example.com when *.example.com does not resolve
 * produces a link that fails before it even reaches the server — worse
 * than a plain one, because a printed sticker cannot be edited.
 *
 * So the default is the branded path: one hostname, one certificate, no
 * DNS work when a restaurant signs up, and the name still in the URL.
 *
 * Every form resolves. The proxy matches a custom domain first, then a
 * platform subdomain; /m/<slug>/t/<code> and bare /t/<code> are routes.
 */
export function tableStorefrontUrl(
  publicCode: string,
  options: StorefrontUrlOptions = {},
): string {
  const base = env.APP_URL.replace(/\/+$/, "");

  if (options.customDomain) {
    // A custom domain is stored as a bare hostname; assume https, since
    // the platform issues a certificate for every domain it accepts.
    return `https://${options.customDomain}/t/${publicCode}`;
  }

  if (options.tenantSlug && env.APP_DOMAIN) {
    try {
      const url = new URL(base);
      // Only build a subdomain when the app is actually served from the
      // configured root domain. On localhost, or a preview deployment,
      // <slug>.localhost:3000 would not resolve.
      if (
        url.hostname === env.APP_DOMAIN ||
        url.hostname.endsWith(`.${env.APP_DOMAIN}`)
      ) {
        url.hostname = `${options.tenantSlug}.${env.APP_DOMAIN}`;
        return `${url.origin}/t/${publicCode}`;
      }
    } catch {
      // APP_URL is validated at boot, so this should be unreachable.
    }
  }

  if (options.tenantSlug) {
    return `${base}/m/${options.tenantSlug}/t/${publicCode}`;
  }

  return `${base}/t/${publicCode}`;
}

/**
 * Error correction is set to M (~15% recoverable) rather than the default
 * L: these stickers live on restaurant tables, where they get scratched,
 * splashed, and partly peeled. The size cost is small and a code that
 * still scans after a month of service is worth it.
 */
const QR_OPTIONS = {
  errorCorrectionLevel: "M",
  margin: 2,
} as const;

export function tableQrPngBuffer(
  publicCode: string,
  width = 512,
  options: StorefrontUrlOptions = {},
): Promise<Buffer> {
  return QRCode.toBuffer(tableStorefrontUrl(publicCode, options), {
    ...QR_OPTIONS,
    type: "png",
    width,
  });
}

/**
 * SVG for the printable sheet — vector so a table code stays sharp at any
 * print size, and small enough to inline many of them in one page.
 */
export function tableQrSvg(
  publicCode: string,
  width = 240,
  options: StorefrontUrlOptions = {},
): Promise<string> {
  return QRCode.toString(tableStorefrontUrl(publicCode, options), {
    ...QR_OPTIONS,
    type: "svg",
    width,
  });
}
