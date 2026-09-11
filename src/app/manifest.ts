import type { MetadataRoute } from "next";

/**
 * Web app manifest — what makes this installable to a home screen.
 *
 * The audience is staff, not diners. A kitchen tablet and a waiter's
 * phone want this pinned and opening without browser chrome; a guest
 * scanning a QR code at a table is there for ten minutes and should
 * never be nagged to install anything.
 *
 * `start_url` is therefore /staff rather than "/": someone installing
 * this is installing the console they work from.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QR Menu & Ordering",
    short_name: "QR Menu",
    description: "Take QR menu orders, run the kitchen display and work the floor.",
    start_url: "/staff",
    // Standalone hides the address bar, so a propped-up tablet gains
    // the vertical space and cannot be navigated away from by accident.
    display: "standalone",
    orientation: "any",
    background_color: "#fafafa",
    theme_color: "#18181b",
    categories: ["food", "business", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Maskable lets Android crop to its own shape without clipping
      // anything that matters — the icon carries its own safe padding.
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Kitchen display",
        short_name: "Kitchen",
        url: "/staff/kitchen",
      },
      {
        name: "Floor view",
        short_name: "Floor",
        url: "/staff/floor",
      },
    ],
  };
}
