"use client";

import { useCallback } from "react";
import { useLocalStorageState } from "@/lib/use-local-storage";

/**
 * Dishes a diner has hearted.
 *
 * Kept on the device rather than on the server, deliberately: a diner is
 * anonymous — there is no account to attach a favourite to, and asking
 * someone to sign in before they can heart a curry would lose both the
 * favourite and the order.
 *
 * Keyed per restaurant, so hearting a dish at one place does not leak
 * into another's menu, and so the list cannot grow without bound across
 * every restaurant a phone has ever scanned.
 */

/** Stable identity so the storage hook's fallback never changes reference. */
const EMPTY: string[] = [];

function parseFavourites(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    // A stale or hand-edited value must not break the menu someone is
    // trying to order from.
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return null;
  }
}

export function useFavourites(publicCode: string) {
  const [ids, setIds] = useLocalStorageState<string[]>(
    `qrmenu.favourites.${publicCode}`,
    EMPTY,
    parseFavourites,
  );

  const isFavourite = useCallback(
    (menuItemId: string) => ids.includes(menuItemId),
    [ids],
  );

  // Takes the updater form so two taps in the same render each build on
  // the previous write rather than both starting from the same array.
  const toggle = useCallback(
    (menuItemId: string) => {
      setIds((current) =>
        current.includes(menuItemId)
          ? current.filter((id) => id !== menuItemId)
          : [...current, menuItemId],
      );
    },
    [setIds],
  );

  return { favourites: ids, isFavourite, toggle, count: ids.length };
}
