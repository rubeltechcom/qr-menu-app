"use client";

import { useActionState } from "react";
import { staffLoginAction, type StaffLoginFormState } from "./actions";

const initialState: StaffLoginFormState = {};

export default function StaffLoginPage() {
  const [state, formAction, pending] = useActionState(staffLoginAction, initialState);

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-16">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Staff sign in
      </h1>

      <form action={formAction} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">Restaurant</span>
          <input
            name="tenantSlug"
            type="text"
            autoComplete="off"
            required
            className="rounded-lg border border-zinc-300 bg-white px-3 py-3 text-center text-lg text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">PIN</span>
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4,6}"
            autoComplete="off"
            required
            className="rounded-lg border border-zinc-300 bg-white px-3 py-3 text-center text-2xl tracking-[0.5em] text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        {state.error && (
          <p className="text-center text-sm text-red-600 dark:text-red-400">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-full bg-zinc-900 px-5 py-4 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "Checking…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
