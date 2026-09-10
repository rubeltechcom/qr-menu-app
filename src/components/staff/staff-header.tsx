"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChefHat, LayoutGrid, LogOut } from "lucide-react";
import type { ConnectionState } from "@/lib/use-live-orders";

/**
 * The bar across the top of both staff screens.
 *
 * Shared so the kitchen and the floor cannot drift apart, and so the one
 * control that matters — turning on sound and notifications — is in the
 * same place on whichever screen someone happens to be standing at.
 *
 * Two things are deliberately prominent: whether the live connection is
 * actually up (a silent stale screen is the worst failure this system
 * has), and whether alerts are armed.
 */

const TABS = [
  { href: "/staff/kitchen", label: "Kitchen", icon: ChefHat },
  { href: "/staff/floor", label: "Floor", icon: LayoutGrid },
];

export function StaffHeader({
  title,
  subtitle,
  connection,
  isFullyArmed,
  onEnableAlerts,
  children,
}: {
  title: string;
  subtitle?: string;
  connection: ConnectionState;
  isFullyArmed: boolean;
  onEnableAlerts: () => void;
  /** Screen-specific controls, e.g. the kitchen's type filter. */
  children?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">{title}</h1>
            {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
          </div>

          <nav className="flex rounded-lg bg-zinc-100 p-1">
            {TABS.map((tab) => {
              const isActive = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* Browsers require a gesture for both the audio unlock and
              the notification prompt, so this button is functional
              rather than a preference. */}
          {!isFullyArmed ? (
            <button
              type="button"
              onClick={onEnableAlerts}
              className="flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              <Bell className="h-4 w-4" />
              Turn on alerts
            </button>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-zinc-500">
              <Bell className="h-4 w-4" />
              Alerts on
            </span>
          )}

          <ConnectionDot state={connection} />

          <Link
            href="/staff"
            aria-label="Staff home"
            className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          >
            <LogOut className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {children && <div className="px-4 pb-3 sm:px-6">{children}</div>}
    </header>
  );
}

function ConnectionDot({ state }: { state: ConnectionState }) {
  const [tone, label] =
    state === "live"
      ? ["bg-green-500", "Live"]
      : state === "connecting"
        ? ["bg-amber-500", "Connecting"]
        : // Offline is the dangerous one: the screen is stale and new
          // orders are not arriving, so it says so rather than sitting quiet.
          ["bg-red-500 animate-pulse", "Offline"];

  return (
    <span className="flex items-center gap-2 text-sm font-medium text-zinc-600">
      <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
      {label}
    </span>
  );
}
