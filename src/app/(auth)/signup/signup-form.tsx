"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Eye, EyeOff } from "lucide-react";
import { signUpAction, type SignUpFormState } from "./actions";

const initialState: SignUpFormState = {};

/**
 * Creating a restaurant account.
 *
 * The form is short on purpose — name, email, password, restaurant,
 * link — because everything else (timezone, currency, menus, tables)
 * is better asked once they can see what it is for. The two pieces of
 * help here are the ones people actually get stuck on: what the menu
 * link will look like, and why a password was rejected.
 *
 * `appDomain` and `plan` are read on the server and handed down, so
 * this stays a plain client component with no environment access.
 */
export function SignUpForm({
  plan,
  appDomain,
}: {
  plan: string | null;
  appDomain: string;
}) {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  const [restaurantName, setRestaurantName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // The link is derived from the restaurant's name until the owner edits
  // it themselves, at which point their version wins — retyping it under
  // them as they fix a typo in the name would be maddening.
  const effectiveSlug = slugTouched ? slug : slugify(restaurantName);

  const checks = useMemo(
    () => [
      { label: "At least 10 characters", passed: password.length >= 10 },
      {
        label: "An uppercase and a lowercase letter",
        passed: /[a-z]/.test(password) && /[A-Z]/.test(password),
      },
      { label: "A number", passed: /[0-9]/.test(password) },
    ],
    [password],
  );

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
        Create your restaurant account
      </h1>
      <p className="mt-2 text-zinc-600">
        Menu builder, QR codes and the order dashboard — free to start.
      </p>

      <form action={formAction} className="mt-8 flex flex-col gap-5">
        {/* Carried through so the dashboard can offer the plan they
            picked on the pricing page. Nothing is charged at signup. */}
        {plan && <input type="hidden" name="plan" value={plan} />}

        <Field
          label="Your name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Alex Rahman"
          error={state.fieldErrors?.name}
        />

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@restaurant.com"
          error={state.fieldErrors?.email}
        />

        <div>
          <label htmlFor="password" className="text-sm font-medium text-zinc-800">
            Password
          </label>
          <div className="relative mt-1.5">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={state.fieldErrors?.password ? true : undefined}
              className={`w-full rounded-lg border bg-white px-3.5 py-2.5 pr-11 text-zinc-900 transition-colors outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-900/10 ${
                state.fieldErrors?.password
                  ? "border-red-400 focus:border-red-500"
                  : "border-zinc-300 focus:border-zinc-900"
              }`}
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

          {/* Shown as it is typed rather than as a rejection afterwards. */}
          <ul className="mt-2 flex flex-col gap-1">
            {checks.map((check) => (
              <li
                key={check.label}
                className={`flex items-center gap-2 text-xs ${
                  check.passed ? "text-green-700" : "text-zinc-500"
                }`}
              >
                <Check
                  className={`h-3.5 w-3.5 ${check.passed ? "opacity-100" : "opacity-30"}`}
                />
                {check.label}
              </li>
            ))}
          </ul>

          {state.fieldErrors?.password && (
            <p className="mt-1.5 text-xs font-medium text-red-600">
              {state.fieldErrors.password}
            </p>
          )}
        </div>

        <hr className="border-zinc-200" />

        <Field
          label="Restaurant name"
          name="restaurantName"
          type="text"
          placeholder="The Riverside Kitchen"
          value={restaurantName}
          onChange={setRestaurantName}
          error={state.fieldErrors?.restaurantName}
        />

        <div>
          <label htmlFor="slug" className="text-sm font-medium text-zinc-800">
            Your menu link
          </label>
          <div
            className={`mt-1.5 flex items-center overflow-hidden rounded-lg border bg-white transition-colors focus-within:ring-2 focus-within:ring-zinc-900/10 ${
              state.fieldErrors?.slug
                ? "border-red-400 focus-within:border-red-500"
                : "border-zinc-300 focus-within:border-zinc-900"
            }`}
          >
            <input
              id="slug"
              name="slug"
              type="text"
              required
              value={effectiveSlug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(slugify(event.target.value));
              }}
              placeholder="riverside-kitchen"
              aria-invalid={state.fieldErrors?.slug ? true : undefined}
              className="min-w-0 flex-1 px-3.5 py-2.5 text-zinc-900 outline-none placeholder:text-zinc-400"
            />
            <span className="shrink-0 border-l border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-500">
              .{appDomain}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">
            {state.fieldErrors?.slug ? (
              <span className="font-medium text-red-600">{state.fieldErrors.slug}</span>
            ) : (
              "Lowercase letters, numbers and hyphens."
            )}
          </p>
        </div>

        {state.error && !state.fieldErrors && (
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
          {pending ? "Creating your account…" : "Create account"}
        </button>

        <p className="text-center text-sm text-zinc-600">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-zinc-900 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}

/** The same shape the server enforces, applied as the owner types. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function Field({
  label,
  name,
  type,
  autoComplete,
  placeholder,
  error,
  value,
  onChange,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
  placeholder?: string;
  error?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={name} className="text-sm font-medium text-zinc-800">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        {...(onChange
          ? { value, onChange: (event) => onChange(event.target.value) }
          : {})}
        aria-invalid={error ? true : undefined}
        className={`mt-1.5 w-full rounded-lg border bg-white px-3.5 py-2.5 text-zinc-900 transition-colors outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-900/10 ${
          error
            ? "border-red-400 focus:border-red-500"
            : "border-zinc-300 focus:border-zinc-900"
        }`}
      />
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
