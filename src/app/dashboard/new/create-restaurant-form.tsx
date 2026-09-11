"use client";

import { useActionState, useState } from "react";
import { createRestaurantAction, type CreateRestaurantState } from "./actions";

const initialState: CreateRestaurantState = {};

/** Same rule the server enforces, so the preview cannot promise a slug
 *  the save would reject. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
}

export function CreateRestaurantForm({ menuUrlBase }: { menuUrlBase: string }) {
  const [state, formAction, pending] = useActionState(
    createRestaurantAction,
    initialState,
  );

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div>
        <label htmlFor="name" className={LABEL}>
          Restaurant name
        </label>
        <input
          id="name"
          name="name"
          required
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="The Riverside Kitchen"
          className={INPUT}
        />
      </div>

      <div>
        <label htmlFor="slug" className={LABEL}>
          Your menu link
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
          Lowercase letters, numbers and hyphens. This cannot be changed later.
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

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-full bg-zinc-900 px-5 py-3.5 text-base font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create restaurant"}
      </button>
    </form>
  );
}

const LABEL = "text-sm font-medium text-zinc-900";
const INPUT =
  "mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";
