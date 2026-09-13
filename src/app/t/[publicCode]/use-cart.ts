"use client";

import { useCallback } from "react";
import { useLocalStorageState } from "@/lib/use-local-storage";

export interface CartLine {
  id: string; // unique per distinct combination
  menuItemId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  note?: string;
}

/** Stable identity so the storage hook's fallback never changes reference. */
const EMPTY: CartLine[] = [];

function parseCart(raw: string): CartLine[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    // A stale or hand-edited value must not crash the menu the diner is
    // trying to order from — drop anything that isn't a valid line.
    return parsed.filter(isCartLine);
  } catch {
    return null;
  }
}

/**
 * The diner's cart.
 *
 * Persisted to localStorage per table, because a phone in a restaurant
 * gets locked, backgrounded and reloaded constantly — losing a
 * half-built order to an accidental swipe is the fastest way to lose the
 * order entirely (PROMPT.md §6.1: "Cart persists across refresh and
 * accidental tab closure").
 *
 * Keyed by storefront scope (see scope.ts) so two tables open in two
 * tabs don't share a cart — and neither do two shops, which have no
 * table code to tell them apart.
 */
export function useCart(storageKey: string) {
  const [lines, setLines] = useLocalStorageState<CartLine[]>(
    `qrmenu.cart.${storageKey}`,
    EMPTY,
    parseCart,
  );

  // These take the updater form so that repeated calls within a single
  // render — tapping + several times before React re-renders — each build
  // on the previous write instead of all starting from the same array.
  const add = useCallback(
    (item: Omit<CartLine, "quantity" | "id">) => {
      const id = `${item.menuItemId}-${item.note ?? ""}`;
      setLines((current) => {
        const index = current.findIndex((line) => line.id === id);
        if (index === -1) return [...current, { ...item, id, quantity: 1 }];
        const next = [...current];
        next[index] = { ...next[index]!, quantity: next[index]!.quantity + 1 };
        return next;
      });
    },
    [setLines],
  );

  const setQuantity = useCallback(
    (id: string, quantity: number) => {
      setLines((current) =>
        quantity <= 0
          ? current.filter((line) => line.id !== id)
          : current.map((line) => (line.id === id ? { ...line, quantity } : line)),
      );
    },
    [setLines],
  );

  const clear = useCallback(() => setLines(EMPTY), [setLines]);

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotalCents = lines.reduce(
    (sum, line) => sum + line.unitPriceCents * line.quantity,
    0,
  );

  return { lines, add, setQuantity, clear, itemCount, subtotalCents };
}

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Partial<CartLine>;
  return (
    (typeof line.id === "string" || typeof line.id === "undefined") &&
    typeof line.menuItemId === "string" &&
    typeof line.name === "string" &&
    typeof line.unitPriceCents === "number" &&
    typeof line.quantity === "number" &&
    line.quantity > 0 &&
    (typeof line.note === "string" || typeof line.note === "undefined")
  );
}
