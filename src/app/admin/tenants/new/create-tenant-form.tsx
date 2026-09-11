"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { createTenantAction, type CreateTenantState } from "../../actions";

const initialState: CreateTenantState = {};

/** Same rule as the public signup form, so the preview does not lie. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

export function CreateTenantForm({ menuUrlBase }: { menuUrlBase: string }) {
  const [state, formAction, pending] = useActionState(createTenantAction, initialState);

  const [restaurantName, setRestaurantName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(restaurantName);

  if (state.ok && state.createdSlug) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6">
        <p className="flex items-center gap-2 font-semibold text-green-900">
          <Check className="h-5 w-5" />
          Restaurant created
        </p>
        <p className="mt-2 text-sm text-green-800">
          Give the owner their email and the password you set — there is no welcome email
          yet, so nothing has been sent to them.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/admin/tenants/${state.createdSlug}`}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
          >
            Open restaurant
          </Link>
          <Link
            href="/admin/tenants/new"
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Create another
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <div>
        <label htmlFor="restaurantName" className={LABEL}>
          Restaurant name
        </label>
        <input
          id="restaurantName"
          name="restaurantName"
          required
          value={restaurantName}
          onChange={(event) => setRestaurantName(event.target.value)}
          placeholder="Riverside Kitchen"
          className={INPUT}
        />
      </div>

      <div>
        <label htmlFor="slug" className={LABEL}>
          Menu address
        </label>
        <div className="mt-2 flex items-stretch overflow-hidden rounded-lg border border-zinc-300 focus-within:border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/10">
          <span className="shrink-0 border-r border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-500">
            {menuUrlBase}/m/
          </span>
          <input
            id="slug"
            name="slug"
            required
            value={effectiveSlug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(slugify(event.target.value));
            }}
            placeholder="riverside-kitchen"
            className="min-w-0 flex-1 px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
          />
        </div>
        <p className="mt-1.5 text-xs text-zinc-500">
          Lowercase letters, numbers and hyphens. Cannot be changed later.
        </p>
      </div>

      <hr className="border-zinc-100" />

      <p className="text-sm font-medium text-zinc-900">Owner account</p>

      <div>
        <label htmlFor="ownerName" className={LABEL}>
          Owner name
        </label>
        <input
          id="ownerName"
          name="ownerName"
          required
          placeholder="Fatima Rahman"
          className={INPUT}
        />
      </div>

      <div>
        <label htmlFor="email" className={LABEL}>
          Owner email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="owner@example.com"
          className={INPUT}
        />
      </div>

      <div>
        <label htmlFor="password" className={LABEL}>
          Temporary password
        </label>
        <input
          id="password"
          name="password"
          type="text"
          required
          autoComplete="new-password"
          placeholder="At least 10 characters, mixed case and a number"
          className={INPUT}
        />
        <p className="mt-1.5 text-xs text-zinc-500">
          Shown as plain text so you can read it back to the owner. Tell them to change it
          once they log in.
        </p>
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {state.error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create restaurant"}
        </button>
      </div>
    </form>
  );
}

const LABEL = "text-sm font-medium text-zinc-900";
const INPUT =
  "mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";
