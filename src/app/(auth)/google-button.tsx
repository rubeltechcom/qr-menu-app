"use client";

import { useTransition } from "react";
import { googleSignInAction } from "./google-actions";

/**
 * "Continue with Google".
 *
 * Rendered only where Google is actually configured — a button that
 * opens a Google error page because the operator has not set the
 * credentials is worse than no button, and the operator would not see
 * it themselves unless they happened to click it.
 *
 * The mark is inlined rather than loaded from Google's CDN: the page
 * must render identically offline and on a locked-down network, and one
 * more request on the login path is not worth the convenience.
 */
export function GoogleButton({ label }: { label: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => googleSignInAction())}
      className="flex w-full items-center justify-center gap-3 rounded-full border border-zinc-300 bg-white px-5 py-3.5 text-base font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
    >
      <GoogleMark />
      {isPending ? "Opening Google…" : label}
    </button>
  );
}

function GoogleMark() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51Z"
      />
    </svg>
  );
}

/** The "or" rule between the Google button and the email form. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-zinc-200" />
      <span className="text-xs font-medium text-zinc-400 uppercase">or</span>
      <span className="h-px flex-1 bg-zinc-200" />
    </div>
  );
}
