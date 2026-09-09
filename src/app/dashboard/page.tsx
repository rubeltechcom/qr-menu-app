import { requireAuth } from "@/lib/require-auth";
import { rawPrisma } from "@/server/db/client";
import { signOut } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await requireAuth();

  // A user's memberships tell us which tenant(s) they belong to. This
  // is a global (non-tenant-scoped) lookup by design — see the note on
  // "users" in the row_level_security migration — narrowed to the
  // current user's own id only.
  const memberships = await rawPrisma.membership.findMany({
    where: { userId: session.user.id },
    include: { tenant: { select: { id: true, slug: true, name: true, plan: true } } },
  });

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Welcome, {session.user.name ?? session.user.email}
        </h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Log out
          </button>
        </form>
      </div>

      <h2 className="mt-10 text-sm font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        Your restaurants
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {memberships.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
          >
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{m.tenant.name}</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {m.tenant.slug} · {m.role.toLowerCase()} · {m.tenant.plan.toLowerCase()} plan
              </p>
            </div>
          </li>
        ))}
        {memberships.length === 0 && (
          <li className="text-sm text-zinc-500 dark:text-zinc-400">
            No restaurants yet.
          </li>
        )}
      </ul>
    </div>
  );
}
