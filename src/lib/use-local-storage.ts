"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * Read and write a JSON value in localStorage, hydration-safe.
 *
 * The naive version — `useState` plus a `useEffect` that reads storage —
 * sets state during an effect, which React now flags: it causes a
 * cascading render, and briefly paints the empty state before the real
 * value arrives. `useSyncExternalStore` is the supported way to read a
 * value that exists only in the browser: the server snapshot matches the
 * HTML that was sent, and the client snapshot is correct on first paint.
 *
 * Storage access is wrapped throughout because it throws outright in
 * some privacy modes rather than merely returning null.
 */

/** Listeners for same-tab writes — `storage` only fires in *other* tabs. */
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function useLocalStorageState<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T | null,
): [T, (next: T) => void] {
  // The parsed value is cached against the raw string it came from, so
  // repeated snapshot reads return the same reference. Returning a fresh
  // object each time would spin useSyncExternalStore forever.
  const cache = useRef<{ raw: string | null; value: T }>({ raw: null, value: fallback });

  const subscribe = useCallback((onChange: () => void) => {
    listeners.add(onChange);
    window.addEventListener("storage", onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const getSnapshot = useCallback((): T => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      raw = null;
    }

    if (raw !== cache.current.raw) {
      const parsed = raw === null ? null : parse(raw);
      cache.current = { raw, value: parsed ?? fallback };
    }
    return cache.current.value;
  }, [key, fallback, parse]);

  // On the server there is no storage, so the fallback is what renders —
  // and therefore what the client must render first too.
  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Full, blocked, or private mode. The write is lost, but the
        // notify below still refreshes readers from whatever is stored.
      }
      notify();
    },
    [key],
  );

  return [value, setValue];
}
