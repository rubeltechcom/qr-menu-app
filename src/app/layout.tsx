import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "QR Menu & Ordering",
  description: "Digital QR-code menus and contactless ordering for restaurants.",
  // iOS ignores the web manifest, so the installed-app behaviour and
  // the home-screen icon have to be declared separately.
  appleWebApp: {
    capable: true,
    title: "QR Menu",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#18181b",
  // Fills the notch area on an installed iOS app rather than leaving a
  // white band above the header.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // No theme provider. The app is light-only — the provider was
    // configured with forcedTheme="light" and system detection off,
    // there is not a single `dark:` class in the codebase, and the
    // toggle was never rendered. All it did was inject a no-op script
    // that React warns about. If dark mode is wanted later, it comes
    // back together with the styles that would make it mean something.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
