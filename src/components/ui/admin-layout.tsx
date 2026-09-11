"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, LogOut, ChevronLeft } from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
  navItems: {
    label: string;
    href: string;
    icon: React.ReactNode;
    active?: boolean;
  }[];
  title: string;
  userEmail?: string;
  userName?: string | null;
  onLogoutAction: () => Promise<void>;
  backLink?: {
    href: string;
    label: string;
  };
}

export function AdminLayout({
  children,
  navItems,
  title,
  userEmail,
  userName,
  onLogoutAction,
  backLink,
}: AdminLayoutProps) {
  const pathname = usePathname() ?? "";

  return (
    <div className="flex min-h-screen w-full flex-col bg-zinc-50 md:flex-row">
      {/* Sidebar.
          Fixed rather than in the document flow: it used to scroll away
          with the page, so on a long list of restaurants the navigation
          was simply gone. The main column is offset by its width to
          make room. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-zinc-200 bg-white md:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-zinc-200 px-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight text-zinc-900"
          >
            <Store className="h-5 w-5" />
            <span>QR Menu App</span>
          </Link>
        </div>

        {/* Only this scrolls, and only when there are more links than
            fit — the logo and log-out stay put. */}
        <nav className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isRootHref = item.href === "/admin" || /^\/dashboard\/[^/]+$/.test(item.href);
              const isActive = item.active ?? (isRootHref ? pathname === item.href : pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-zinc-100 text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="shrink-0 border-t border-zinc-200 p-4">
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
      </aside>

      {/* Main column. Offset by the fixed sidebar's width on desktop;
          full width below that, where the sidebar is replaced by the
          bottom bar. */}
      <main className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0 md:pl-64">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-4 border-b border-zinc-200 bg-white px-4 shadow-sm sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {backLink && (
              <Link
                href={backLink.href}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                aria-label={backLink.label}
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
            )}
            <h1 className="truncate text-lg font-semibold tracking-tight text-zinc-900">
              {title}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden flex-col items-end sm:flex">
              <span className="text-sm font-medium text-zinc-900">
                {userName || "User"}
              </span>
              <span className="text-xs text-zinc-500">{userEmail}</span>
            </div>
          </div>
        </header>

        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </div>
      </main>

      {/* Navigation on a phone. The sidebar is hidden below md, which
          previously left no way to move between sections at all. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-zinc-200 bg-white md:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                item.active ? "text-zinc-900" : "text-zinc-500"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate px-1">{item.label}</span>
            </Link>
          );
        })}

        <form action={onLogoutAction} className="flex flex-1">
          <button
            type="submit"
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-zinc-500"
          >
            <LogOut className="h-5 w-5" />
            <span>Log out</span>
          </button>
        </form>
      </nav>
    </div>
  );
}
