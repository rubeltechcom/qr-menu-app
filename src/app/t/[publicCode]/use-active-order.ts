"use client";

import { useCallback } from "react";
import { useLocalStorageState } from "@/lib/use-local-storage";

/**
 * The order this device most recently placed.
 *
 * Kept in localStorage rather than React state, because the whole point
 * is to survive the page being reloaded: a diner refreshes, locks their
 * phone, or reopens the tab while waiting for food, and losing the link
 * to their own order leaves them with no way back to it — the track
 * token is unguessable by design, so there is nothing to type in.
 *
 * Keyed per restaurant, like the cart, so two tables open in two tabs
 * do not overwrite each other.
 */

interface ActiveOrder {
  orderNumber: number;
  trackToken: string;
  /** When it was placed, so a stale one can be dropped. */
  placedAt: number;
}

/**
 * How long the link stays on the menu.
 *
 * Four hours covers a long meal with room to spare, and means a phone
 * that scans the same table next week is not still being offered
 * yesterday's order.
 */
const MAX_AGE_MS = 4 * 60 * 60 * 1000;

function parseActiveOrder(raw: string): ActiveOrder | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ActiveOrder> | null;
    if (
      !parsed ||
      typeof parsed.orderNumber !== "number" ||
      typeof parsed.trackToken !== "string" ||
      typeof parsed.placedAt !== "number"
    ) {
      return null;
    }
    // Expired: treat exactly like nothing stored.
    if (Date.now() - parsed.placedAt > MAX_AGE_MS) return null;

    return parsed as ActiveOrder;
  } catch {
    return null;
  }
}

export function useActiveOrder(publicCode: string) {
  const [order, setOrder] = useLocalStorageState<ActiveOrder | null>(
    `qrmenu.active-order.${publicCode}`,
    null,
    parseActiveOrder,
  );

  const remember = useCallback(
    (placed: { orderNumber: number; trackToken: string }) => {
      setOrder({ ...placed, placedAt: Date.now() });
    },
    [setOrder],
  );

  const forget = useCallback(() => setOrder(null), [setOrder]);

  return { activeOrder: order, remember, forget };
}
