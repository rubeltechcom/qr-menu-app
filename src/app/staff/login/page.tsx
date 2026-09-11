"use client";

import { useActionState, useState } from "react";
import { Delete } from "lucide-react";
import { staffLoginAction, type StaffLoginFormState } from "./actions";

const initialState: StaffLoginFormState = {};

/** Matches the pattern the server enforces on the PIN. */
const MAX_PIN = 6;

/**
 * Staff sign in.
 *
 * Built for the device this actually runs on: a tablet on a shelf in a
 * kitchen, used by someone whose hands are full and who is not going to
 * hunt for a small text field. Hence the on-screen keypad with large
 * targets, dark ground to match the kitchen and floor screens, and a PIN
 * rather than a password.
 *
 * The restaurant is typed once and remembered by the browser, so the
 * usual shift-start interaction is four taps.
 */
export default function StaffLoginPage() {
  const [state, formAction, pending] = useActionState(staffLoginAction, initialState);
  const [pin, setPin] = useState("");
  const [restaurant, setRestaurant] = useState("");

  const press = (digit: string) => {
    setPin((current) => (current.length >= MAX_PIN ? current : current + digit));
  };

  // A slug is lowercase with hyphens, and staff on a tablet get a
  // capital first letter and a trailing space from autocorrect — which
  // would otherwise come back as "Restaurant not found".
  const normalise = (value: string) => value.toLowerCase().trim().replace(/\s+/g, "-");

  const canSubmit = restaurant.trim().length > 0 && pin.length >= 4;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-12 text-zinc-900">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-bold tracking-tight">Staff sign in</h1>
        <p className="mt-2 text-center text-zinc-500">
          Enter the restaurant and your PIN.
        </p>

        <form action={formAction} className="mt-8 flex flex-col gap-5">
          <div>
            <label htmlFor="tenantSlug" className="text-sm font-medium text-zinc-800">
              Restaurant
            </label>
            <input
              id="tenantSlug"
              name="tenantSlug"
              type="text"
              // Remembered between shifts; the PIN never is.
              autoComplete="organization"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={restaurant}
              onChange={(event) => setRestaurant(normalise(event.target.value))}
              // Deliberately not a realistic-looking slug: a placeholder
              // that reads like a real answer gets submitted blank.
              placeholder="your-restaurant"
              className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3.5 text-center text-lg transition-colors outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
            />
            <p className="mt-1.5 text-center text-xs text-zinc-500">
              The name in your menu link, e.g. demo-diner
            </p>
          </div>

          <div>
            <span className="text-sm font-medium text-zinc-800">PIN</span>
            {/* The real field, driven by the keypad below. Kept as an
                input so password managers, autofill and a hardware
                keyboard all still work on a tablet with one attached. */}
            <input
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4,6}"
              autoComplete="off"
              required
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, "").slice(0, MAX_PIN))
              }
              className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3.5 text-center text-3xl tracking-[0.5em] transition-colors outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
              <KeypadButton key={digit} onClick={() => press(digit)}>
                {digit}
              </KeypadButton>
            ))}
            <KeypadButton onClick={() => setPin("")}>
              <span className="text-base font-medium">Clear</span>
            </KeypadButton>
            <KeypadButton onClick={() => press("0")}>0</KeypadButton>
            <KeypadButton onClick={() => setPin((current) => current.slice(0, -1))}>
              <Delete className="h-6 w-6" />
            </KeypadButton>
          </div>

          {state.error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700"
            >
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || !canSubmit}
            className="rounded-full bg-zinc-900 px-5 py-4 text-lg font-bold text-white transition-colors hover:bg-zinc-700 disabled:opacity-40"
          >
            {pending ? "Checking…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

function KeypadButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Large enough to hit reliably with a thumb, and active: rather
      // than hover: because this is a touchscreen.
      className="flex h-16 items-center justify-center rounded-xl bg-white text-2xl font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-200 transition-colors active:bg-zinc-100"
    >
      {children}
    </button>
  );
}
