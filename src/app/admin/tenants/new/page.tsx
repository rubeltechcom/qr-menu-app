import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireSuperadmin } from "@/lib/require-superadmin";
import { env } from "@/lib/env";
import { CreateTenantForm } from "./create-tenant-form";

/**
 * Create a restaurant by hand.
 *
 * For onboarding a customer who was sold over the phone, or who cannot
 * complete the public form themselves.
 */
export const dynamic = "force-dynamic";

export default async function NewTenantPage() {
  await requireSuperadmin();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <Link
          href="/admin/tenants"
          className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Restaurants
        </Link>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
          New restaurant
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Creates the restaurant and its owner login, exactly as signing up would.
        </p>
      </div>

      <CreateTenantForm menuUrlBase={new URL(env.APP_URL).host} />
    </div>
  );
}
