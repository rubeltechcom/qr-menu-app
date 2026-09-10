import Link from "next/link";
import { requireStaffSession } from "@/lib/require-staff-session";

/**
 * Staff console home — the choice a tablet makes once, then stays on.
 *
 * Two large targets rather than a nav bar: this screen is tapped with a
 * thumb, often by someone holding a tray.
 */
export default async function StaffHomePage() {
  const session = await requireStaffSession();

  return (
    <div className="mx-auto min-h-screen max-w-xl px-6 py-14">
      <p className="text-sm font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        {session.role.toLowerCase()}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Welcome, {session.name ?? "team member"}
      </h1>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/staff/kitchen"
          className="rounded-2xl border-2 border-zinc-300 p-6 dark:border-zinc-700"
        >
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Kitchen</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Tickets as they come in, oldest first.
          </p>
        </Link>

        <Link
          href="/staff/floor"
          className="rounded-2xl border-2 border-zinc-300 p-6 dark:border-zinc-700"
        >
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Floor</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Every table, and what it is waiting on.
          </p>
        </Link>
      </div>
    </div>
  );
}
