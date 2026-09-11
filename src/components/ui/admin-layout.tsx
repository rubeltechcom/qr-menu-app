"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, LogOut, ChevronLeft, Menu, X, ExternalLink } from "lucide-react";

/**
 * Chrome shared by the platform admin and a restaurant's dashboard.
 *
 * Navigation is decided here, on the client, from usePathname(). It used
 * to be built in the server layout from an `x-pathname` request header,
 * which looked equivalent but was not: Next.js keeps a layout mounted
 * across client-side navigations, so the header was only ever read on a
 * full page load. Moving between sections left the old links in place —
 * the "shows the wrong menu until you refresh" bug. usePathname()
 * updates on every navigation, so the nav is always current.
 */

export interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Matched as a prefix — for a section with child pages under it. */
  prefix?: boolean;
  /** Shown at the right of the row, e.g. a count of pending orders. */
  badge?: number;
}

export interface NavSection {
  /** Omitted for the first group, which needs no heading. */
  title?: string;
  items: NavItem[];
}

export interface WorkspaceLink {
  label: string;
  href: string;
  current?: boolean;
}

interface AdminLayoutProps {
  children: React.ReactNode;
  sections: NavSection[];
  title: string;
  subtitle?: string;
  userEmail?: string;
  userName?: string | null;
  onLogoutAction: () => Promise<void>;
  backLink?: { href: string; label: string };
  /** Restaurants this user can switch between, for the sidebar picker. */
  workspaces?: WorkspaceLink[];
  /** "View live menu" and the like — opened in a new tab. */
  externalLink?: { href: string; label: string };
}

/** Exported for tests — the matching rules have real edge cases. */
export function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.prefix) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return pathname === item.href;
}

export function AdminLayout({
  children,
  sections,
  title,
  subtitle,
  userEmail,
  userName,
  onLogoutAction,
  backLink,
  workspaces,
  externalLink,
}: AdminLayoutProps) {
  const pathname = usePathname() ?? "";
  const [isMobileNavOpen, setMobileNavOpen] = useState(false);

  // Closed from the links themselves rather than from an effect
  // watching the pathname: navigating is the only thing that should
  // dismiss it, and doing it on the click keeps the state change in the
  // event that caused it.
  const closeMobileNav = () => setMobileNavOpen(false);

  const allItems = sections.flatMap((section) => section.items);

  const navBody = (
    <>
      {workspaces && workspaces.length > 0 && (
        <div className="border-b border-zinc-200 p-3">
          <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
            Restaurant
          </p>
          <div className="flex flex-col gap-0.5">
            {workspaces.map((workspace) => (
              <Link
                key={workspace.href}
                href={workspace.href}
                onClick={closeMobileNav}
                className={`truncate rounded-md px-2 py-1.5 text-sm transition-colors ${
                  workspace.current
                    ? "bg-zinc-900 font-medium text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                {workspace.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <nav className="min-h-0 flex-1 overflow-y-auto p-3">
        {sections.map((section, index) => (
          <div key={section.title ?? index} className={index > 0 ? "mt-5" : ""}>
            {section.title && (
              <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                {section.title}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const isActive = isItemActive(item, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMobileNav}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-zinc-100 text-zinc-900"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    }`}
                  >
                    {item.icon}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge != null && item.badge > 0 && (
                      <span className="shrink-0 rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-zinc-200 p-3">
        {externalLink && (
          <a
            href={externalLink.href}
            target="_blank"
            rel="noreferrer"
            className="mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <ExternalLink className="h-4 w-4" />
            {externalLink.label}
          </a>
        )}
        <form action={onLogoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </form>
      </div>
    </>
  );

  return (
    <div className="min-h-screen w-full bg-zinc-50">
      {/* Sidebar. Fixed rather than in the document flow: it used to
          scroll away with the page, so on a long list the navigation
          was simply gone. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-zinc-200 bg-white md:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-zinc-200 px-5">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight text-zinc-900"
          >
            <Store className="h-5 w-5" />
            <span>QR Menu App</span>
          </Link>
        </div>
        {navBody}
      </aside>

      {/* The same navigation as a drawer on a phone, where a 64-wide
          sidebar does not fit. A bottom bar was tried first, but it
          cannot hold this many sections without becoming unreadable. */}
      {isMobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-zinc-900/40"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 px-5">
              <span className="flex items-center gap-2 font-semibold text-zinc-900">
                <Store className="h-5 w-5" />
                QR Menu App
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
                className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {navBody}
          </div>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-col md:pl-64">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-100 md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>

          {backLink && (
            <Link
              href={backLink.href}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 md:flex"
              aria-label={backLink.label}
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight text-zinc-900">
              {title}
            </h1>
            {subtitle && <p className="truncate text-xs text-zinc-500">{subtitle}</p>}
          </div>

          <div className="hidden flex-col items-end sm:flex">
            <span className="text-sm font-medium text-zinc-900">
              {userName || "User"}
            </span>
            <span className="text-xs text-zinc-500">{userEmail}</span>
          </div>
        </header>

        {/* A horizontal section strip on phones, so the current section
            is visible without opening the drawer. */}
        <div className="scrollbar-hide flex gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-3 py-2 md:hidden">
          {allItems.map((item) => {
            const isActive = isItemActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </div>
      </div>
    </div>
  );
}
