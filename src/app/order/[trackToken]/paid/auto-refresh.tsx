"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-runs this server component on a timer while a payment is pending.
 *
 * `router.refresh()` rather than a `<meta http-equiv="refresh">`: React
 * inserts that tag into the head after hydration, and browsers ignore a
 * meta-refresh that arrives by script — so the page sat on "still
 * processing" forever while the bank had long since confirmed. This also
 * keeps the position on the page and avoids a white flash.
 *
 * Renders nothing. It only exists for the effect.
 */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      // Pointless while nobody is looking, and a phone in a pocket must
      // not wake the server every few seconds.
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);

    return () => clearInterval(timer);
  }, [router, seconds]);

  return null;
}
