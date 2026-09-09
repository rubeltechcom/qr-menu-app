"use client";

import { useTransition } from "react";
import {
  toggleMenuItemAction,
  deleteMenuItemAction,
  duplicateMenuItemAction,
} from "./actions";

/**
 * A one-tap availability switch directly on each item card, per
 * PROMPT.md §6.2: "86'd items go greyed-out immediately, no page
 * reload". useTransition gives instant visual feedback while the
 * Server Action + revalidatePath round-trip completes.
 */
export function ItemAvailabilityToggle({
  tenantSlug,
  itemId,
  isAvailable,
}: {
  tenantSlug: string;
  itemId: string;
  isAvailable: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={isAvailable}
      aria-label={isAvailable ? "Mark unavailable" : "Mark available"}
      disabled={isPending}
      onClick={() =>
        startTransition(() => {
          toggleMenuItemAction(tenantSlug, itemId, !isAvailable);
        })
      }
      className={`h-5 w-9 shrink-0 rounded-full transition-colors ${
        isAvailable ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"
      } ${isPending ? "opacity-50" : ""}`}
    >
      <span
        className={`block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform ${
          isAvailable ? "translate-x-4.5" : ""
        }`}
      />
    </button>
  );
}

export function DuplicateItemButton({
  tenantSlug,
  itemId,
}: {
  tenantSlug: string;
  itemId: string;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      title="Duplicate"
      disabled={isPending}
      onClick={() => startTransition(() => duplicateMenuItemAction(tenantSlug, itemId))}
      className="text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-50"
    >
      ⧉
    </button>
  );
}

export function DeleteItemButton({ tenantSlug, itemId }: { tenantSlug: string; itemId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      title="Delete"
      disabled={isPending}
      onClick={() => {
        if (confirm("Remove this dish from the menu?")) {
          startTransition(() => deleteMenuItemAction(tenantSlug, itemId));
        }
      }}
      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
    >
      ✕
    </button>
  );
}
