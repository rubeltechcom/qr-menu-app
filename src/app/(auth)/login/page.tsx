"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { loginAction, type LoginFormState } from "./actions";

const initialState: LoginFormState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Welcome back</h1>
      <p className="mt-2 text-zinc-600">Log in to your menu and orders.</p>

      <form action={formAction} className="mt-8 flex flex-col gap-5">
        <div>
          <label htmlFor="email" className="text-sm font-medium text-zinc-800">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@restaurant.com"
            required
            className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-zinc-900 transition-colors outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>

        <div>
          <label htmlFor="password" className="text-sm font-medium text-zinc-800">
            Password
          </label>
          <div className="relative mt-1.5">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 pr-11 text-zinc-900 transition-colors outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
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
          {pending ? "Logging in…" : "Log in"}
        </button>

        <p className="text-center text-sm text-zinc-600">
          New here?{" "}
          <Link href="/signup" className="font-semibold text-zinc-900 hover:underline">
            Create your free menu
          </Link>
        </p>
      </form>

      {/* Staff use a PIN on a shared tablet rather than an email login,
          and they will otherwise try this form first. */}
      <p className="mt-10 border-t border-zinc-200 pt-6 text-center text-sm text-zinc-500">
        Kitchen or waiting staff?{" "}
        <Link href="/staff/login" className="font-medium text-zinc-700 hover:underline">
          Sign in with your PIN
        </Link>
      </p>
    </div>
  );
}
