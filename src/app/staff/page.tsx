import { requireStaffSession } from "@/lib/require-staff-session";

export default async function StaffHomePage() {
  const session = await requireStaffSession();

  return (
    <div className="mx-auto max-w-xl px-6 py-16 text-center">
      <p className="text-sm font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        {session.role.toLowerCase()}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Welcome, {session.name ?? "team member"}
      </h1>
      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        The kitchen display and waiter floor view are built in Phase 4
        (Realtime Ordering) — see PROMPT.md §11.
      </p>
    </div>
  );
}
