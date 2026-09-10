"use client";

import { useCallback } from "react";
import { useLocalStorageState } from "@/lib/use-local-storage";

export interface CartLine {
  menuItemId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
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
 * Keyed by publicCode so two tables open in two tabs don't share a cart.
 */
export function useCart(publicCode: string) {
  const [lines, setLines] = useLocalStorageState<CartLine[]>(
    `qrmenu.cart.${publicCode}`,
    EMPTY,
    parseCart,
  );

  const add = useCallback(
    (item: Omit<CartLine, "quantity">) => {
      const index = lines.findIndex((line) => line.menuItemId === item.menuItemId);
      if (index === -1) {
        setLines([...lines, { ...item, quantity: 1 }]);
        return;
      }
      const next = [...lines];
      next[index] = { ...next[index]!, quantity: next[index]!.quantity + 1 };
      setLines(next);
    },
    [lines, setLines],
  );

  const setQuantity = useCallback(
    (menuItemId: string, quantity: number) => {
      setLines(
        quantity <= 0
          ? lines.filter((line) => line.menuItemId !== menuItemId)
          : lines.map((line) =>
              line.menuItemId === menuItemId ? { ...line, quantity } : line,
            ),
      );
    },
    [lines, setLines],
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
    typeof line.menuItemId === "string" &&
    typeof line.name === "string" &&
    typeof line.unitPriceCents === "number" &&
    typeof line.quantity === "number" &&
    line.quantity > 0
  );
}
