"use client";

import { useActionState } from "react";
import { signUpAction, type SignUpFormState } from "./actions";

const initialState: SignUpFormState = {};

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Create your restaurant account
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Menu builder, QR codes, and order dashboard — free to start.
      </p>

      <form action={formAction} className="mt-8 flex flex-col gap-4">
        <Field
          label="Your name"
          name="name"
          type="text"
          autoComplete="name"
          error={state.fieldErrors?.name}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          error={state.fieldErrors?.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          error={state.fieldErrors?.password}
          hint="At least 10 characters, with upper/lowercase and a number."
        />
        <Field
          label="Restaurant name"
          name="restaurantName"
          type="text"
          error={state.fieldErrors?.restaurantName}
        />
        <Field
          label="Choose your menu link"
          name="slug"
          type="text"
          error={state.fieldErrors?.slug}
          hint="This becomes <slug>.yourdomain.com"
        />

        {state.error && !state.fieldErrors && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "Creating your account…" : "Create account"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type,
  autoComplete,
  error,
  hint,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
      {hint && !error && <span className="text-xs text-zinc-500">{hint}</span>}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}
