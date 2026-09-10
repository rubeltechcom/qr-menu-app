"use client";

import { useTransition } from "react";
import { deleteTableAction, regenerateTableCodeAction } from "./actions";

export function DeleteTableButton({
  tenantSlug,
  tableId,
  label,
}: {
  tenantSlug: string;
  tableId: string;
  label: string;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      title="Remove table"
      disabled={isPending}
      onClick={() => {
        if (confirm(`Remove table ${label}? Its QR code will stop working.`)) {
          startTransition(() => {
            deleteTableAction(tenantSlug, tableId);
          });
        }
      }}
      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
    >
      ✕
    </button>
  );
}

/**
 * The recovery when a QR code leaks — someone photographs the sticker and
 * orders to that table from outside the restaurant. A new code invalidates
 * the old one immediately, so the warning below is not boilerplate: the
 * printed sticker on the table genuinely stops working.
 */
export function RegenerateCodeButton({
  tenantSlug,
  tableId,
  label,
}: {
  tenantSlug: string;
  tableId: string;
  label: string;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      title="Issue a new QR code"
      disabled={isPending}
      onClick={() => {
        if (
          confirm(
            `Issue a new QR code for table ${label}?\n\nThe printed code currently on that table will stop working, and you'll need to print and stick the new one.`,
          )
        ) {
          startTransition(() => {
            regenerateTableCodeAction(tenantSlug, tableId);
          });
        }
      }}
      className="text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-50"
    >
      ↻
    </button>
  );
}
