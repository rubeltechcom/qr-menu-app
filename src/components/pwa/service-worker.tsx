"use client";

import { useEffect } from "react";

/**
 * Registers the service worker.
 *
 * Rendered once from the root layout. Registration is deferred to the
 * load event so it never competes with the first paint — a diner
 * scanning a QR code at a table is the latency-critical path, and this
 * is only useful to staff who return to the app repeatedly.
 *
 * Skipped in development: a cached shell is exactly what you do not
 * want while editing, and Next's dev assets are not content-hashed.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch((error) => {
        // Not fatal: the app works fine without it, so this stays a
        // console warning rather than anything the user has to see.
        console.warn("[pwa] service worker registration failed", error);
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
