"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * "Add this to your home screen", offered once staff are signed in.
 *
 * Chrome and Edge fire `beforeinstallprompt`, which lets us defer the
 * browser's own banner and put the choice somewhere it makes sense —
 * on the staff console, not over a diner's menu.
 *
 * iOS Safari fires nothing and has no API, so it gets instructions
 * instead. Both are dismissible, and a dismissal is remembered.
 */

const DISMISSED_KEY = "qrmenu.install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Whether there is anything worth offering on this device. */
function canOfferInstall(): boolean {
  // Already installed: `standalone` is the display mode the manifest
  // asks for, so matching it means there is nothing to offer.
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS reports it here instead.
    (window.navigator as { standalone?: boolean }).standalone === true;
  if (installed) return false;

  try {
    return localStorage.getItem(DISMISSED_KEY) !== "true";
  } catch {
    return true; // private mode — treat as not dismissed
  }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [isDismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Deferred to a task rather than set synchronously here: none of
    // the checks above exist on the server, so this cannot run during
    // render, and updating state in an effect body cascades a render.
    const timer = setTimeout(() => {
      if (!canOfferInstall()) return;
      setDismissed(false);
      // iOS fires no install event and exposes no API — detect and
      // explain the Share-sheet steps instead.
      if (/iphone|ipad|ipod/i.test(window.navigator.userAgent)) {
        setShowIosHint(true);
      }
    }, 0);

    const onBeforeInstall = (event: Event) => {
      // Stops the browser showing its own banner, so the offer appears
      // where we choose rather than over whatever is on screen.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // Nothing to do — it simply reappears next time.
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // The event can only be used once, whatever the answer.
    setDeferred(null);
    dismiss();
  };

  if (isDismissed || (!deferred && !showIosHint)) return null;

  return (
    <div className="mt-8 flex items-start gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
        <Download className="h-5 w-5" />
      </span>

      <div className="flex-1">
        <p className="font-semibold text-zinc-900">Install this on your device</p>
        <p className="mt-1 text-sm text-zinc-600">
          {deferred
            ? "Open it straight from the home screen, full screen and without the address bar."
            : "Tap the Share button, then “Add to Home Screen”."}
        </p>

        {deferred && (
          <button
            type="button"
            onClick={() => void install()}
            className="mt-3 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
          >
            Install
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
