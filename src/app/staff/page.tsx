import Link from "next/link";
import { ChefHat, LayoutGrid } from "lucide-react";
import { requireStaffSession } from "@/lib/require-staff-session";
import { InstallPrompt } from "@/components/pwa/install-prompt";

/**
 * Staff console home — the choice a tablet makes once, then stays on.
 *
 * Two large targets rather than a nav bar: this screen is tapped with a
 * thumb, often by someone holding a tray.
 */
export default async function StaffHomePage() {
  const session = await requireStaffSession();

  const screens = [
    {
      href: "/staff/kitchen",
      icon: ChefHat,
      title: "Kitchen",
      body: "Tickets as they come in, oldest first.",
    },
    {
      href: "/staff/floor",
      icon: LayoutGrid,
      title: "Floor",
      body: "Every table, and what it is waiting on.",
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          {session.role.toLowerCase()}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">
          Welcome, {session.name ?? "team member"}
        </h1>
        <p className="mt-2 text-zinc-600">Pick the screen for this station.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {screens.map((screen) => (
            <Link
              key={screen.href}
              href={screen.href}
              className="group rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
                <screen.icon className="h-6 w-6" />
              </span>
              <p className="mt-4 text-xl font-bold text-zinc-900 group-hover:text-blue-600">
                {screen.title}
              </p>
              <p className="mt-1 text-sm text-zinc-600">{screen.body}</p>
            </Link>
          ))}
        </div>

        <InstallPrompt />
      </div>
    </div>
  );
}
