import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

/**
 * What the service worker serves when a navigation fails.
 *
 * Reached only with no connection, so it must be entirely
 * self-contained: no data, no images, and nothing that needs the
 * network to render.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 text-center">
      <span className="text-5xl">📡</span>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-zinc-900">
        No connection
      </h1>
      <p className="mt-2 max-w-sm text-zinc-600">
        This device is offline. Orders already on screen are still there — new ones will
        arrive as soon as the connection is back.
      </p>
      <p className="mt-6 text-sm text-zinc-500">
        Check the restaurant&rsquo;s wifi, then try again.
      </p>
    </div>
  );
}
