import { requireAuth } from "@/lib/require-auth";
import { env } from "@/lib/env";
import { CreateRestaurantForm } from "./create-restaurant-form";

/**
 * Naming a restaurant after signing in.
 *
 * Reached by an owner who signed up with Google — which tells us who
 * they are but not what their restaurant is called — and by an owner
 * opening a second site.
 */
export const dynamic = "force-dynamic";

export default async function NewRestaurantPage() {
  await requireAuth();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
        Name your restaurant
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        This is what guests see at the top of your menu. You can change the name later —
        the link cannot be changed, so choose it with care.
      </p>

      <div className="mt-8">
        <CreateRestaurantForm menuUrlBase={new URL(env.APP_URL).host} />
      </div>
    </div>
  );
}
