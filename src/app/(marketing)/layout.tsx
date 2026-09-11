import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";

/**
 * Chrome for the public-facing pages.
 *
 * A route group, so these pages sit at "/" and "/pricing" while the
 * dashboard, storefront and staff console — which each have their own
 * very different chrome — are untouched by it.
 */

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL),
  title: {
    default: "QR menu & ordering for restaurants",
    template: "%s · QR Menu",
  },
  description:
    "Give every table a QR code. Guests browse your menu and order from their own phone — dine-in, takeaway or delivery. Free to start.",
  openGraph: {
    type: "website",
    title: "QR menu & ordering for restaurants",
    description:
      "Give every table a QR code. Guests browse your menu and order from their own phone. Free to start.",
    url: env.APP_URL,
  },
};

const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-bold tracking-tight text-zinc-900"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm text-white">
              QR
            </span>
            <span className="text-lg">Menu</span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-full px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
            >
              Create free menu
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold tracking-tight text-zinc-900">
              QR Menu &amp; Ordering
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              Digital menus and contactless ordering for restaurants.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-600">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-zinc-900">
                {item.label}
              </Link>
            ))}
            <Link href="/login" className="hover:text-zinc-900">
              Log in
            </Link>
            <Link href="/staff" className="hover:text-zinc-900">
              Staff console
            </Link>
            <Link href="/privacy-policy" className="hover:text-zinc-900">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-zinc-900">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
