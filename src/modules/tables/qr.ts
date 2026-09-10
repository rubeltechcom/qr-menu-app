import QRCode from "qrcode";
import { env } from "@/lib/env";

/**
 * A table's QR code encodes the storefront URL a diner lands on when they
 * scan it. The code itself is only the publicCode — see public-code.ts for
 * why that is separate from the table's human label.
 */
export function tableStorefrontUrl(publicCode: string): string {
  const base = env.APP_URL.replace(/\/+$/, "");
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

export function tableQrPngBuffer(publicCode: string, width = 512): Promise<Buffer> {
  return QRCode.toBuffer(tableStorefrontUrl(publicCode), {
    ...QR_OPTIONS,
    type: "png",
    width,
  });
}

/**
 * SVG for the printable sheet — vector so a table code stays sharp at any
 * print size, and small enough to inline many of them in one page.
 */
export function tableQrSvg(publicCode: string, width = 240): Promise<string> {
  return QRCode.toString(tableStorefrontUrl(publicCode), {
    ...QR_OPTIONS,
    type: "svg",
    width,
  });
}
