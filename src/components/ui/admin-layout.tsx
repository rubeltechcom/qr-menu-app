import Link from "next/link";
import {
  LayoutDashboard,
  Store,
  MenuSquare,
  Users,
  Settings,
  Shield,
  CreditCard,
  LogOut,
  ChevronLeft
} from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
  navItems: {
    label: string;
    href: string;
    icon: React.ElementType;
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
  return (
    <div className="flex min-h-screen w-full flex-col bg-zinc-50 md:flex-row">
      {/* Sidebar (Desktop) */}
      <aside className="hidden w-64 flex-col border-r border-zinc-200 bg-white md:flex">
        <div className="flex h-16 items-center border-b border-zinc-200 px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-zinc-900">
            <Store className="h-5 w-5" />
            <span>QR Menu App</span>
          </Link>
        </div>
        
        <nav className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    item.active
                      ? "bg-zinc-100 text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-zinc-200 p-4">
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

      {/* Main Content Area */}
      <main className="flex flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-4 border-b border-zinc-200 bg-white px-4 shadow-sm sm:px-6">
          <div className="flex flex-1 items-center gap-4">
            {backLink && (
              <Link
                href={backLink.href}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                aria-label={backLink.label}
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
            )}
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
              {title}
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden flex-col items-end sm:flex">
              <span className="text-sm font-medium text-zinc-900">
                {userName || "User"}
              </span>
              <span className="text-xs text-zinc-500">
                {userEmail}
              </span>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
