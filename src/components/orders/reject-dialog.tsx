"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * Rejecting an order, with a reason.
 *
 * Replaces window.prompt(), which was unstyled, untranslatable, blocked
 * the whole tab, and — worst for this particular job — gave a single
 * blank line to someone who is mid-service and needs to answer in one
 * tap. The common reasons are therefore offered as buttons, with free
 * text underneath for anything else.
 *
 * The reason reaches the guest on their order tracking page, so it is
 * worth making it easy to give a real one.
 */

/** The reasons a kitchen actually rejects an order, in rough order. */
const COMMON_REASONS = [
  "Item sold out",
  "Kitchen too busy",
  "Closing soon",
  "Outside delivery area",
  "Duplicate order",
  "Guest cancelled",
];

export function RejectDialog({
  orderNumber,
  onConfirm,
  onClose,
}: {
  orderNumber: number;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape closes it. A dialog that traps a busy manager mid-service
  // with no way out is worse than the prompt it replaced.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const finalReason = (reason === "__other__" ? custom : reason).trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-title"
        tabIndex={-1}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-zinc-200 px-6 py-4">
          <div>
            <h2 id="reject-title" className="text-lg font-semibold text-zinc-900">
              Reject order #{orderNumber}?
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              The guest sees this reason on their order page.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-2 p-6">
          {COMMON_REASONS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setReason(candidate)}
              aria-pressed={reason === candidate}
              className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                reason === candidate
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {candidate}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setReason("__other__")}
            aria-pressed={reason === "__other__"}
            className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
              reason === "__other__"
                ? "border-zinc-900 bg-zinc-50 text-zinc-900"
                : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            Something else…
          </button>

          {reason === "__other__" && (
            <textarea
              autoFocus
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              rows={3}
              maxLength={200}
              placeholder="Tell the guest what happened."
              className="mt-1 w-full resize-none rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
            />
          )}
        </div>

        <div className="flex gap-3 border-t border-zinc-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Keep order
          </button>
          <button
            type="button"
            // A reason is required: "rejected, no explanation" is the
            // outcome this dialog exists to prevent.
            disabled={finalReason.length === 0}
            onClick={() => onConfirm(finalReason)}
            className="flex-1 rounded-full bg-red-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-40"
          >
            Reject order
          </button>
        </div>
      </div>
    </div>
  );
}
