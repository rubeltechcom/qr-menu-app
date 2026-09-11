"use client";

import { useEffect, useRef } from "react";
import { ElapsedTime, ProgressRail } from "./order-progress";
import { useLiveOrderStatus, type TrackStatus } from "./live-status";

/**
 * The live part of the tracking page.
 *
 * Only the status card and the rail are client-rendered — the order's
 * items and totals are fixed the moment it is placed, so they stay on
 * the server where they cost nothing.
 *
 * Server-rendered first with the status as it was at request time, so
 * the page is correct and readable before any JavaScript runs. The poll
 * then takes over.
 */

const STATUS_COPY: Record<TrackStatus, { title: string; detail: string; emoji: string }> =
  {
    PENDING: {
      title: "Sent to the kitchen",
      detail: "Waiting for the kitchen to accept it.",
      emoji: "📨",
    },
    ACCEPTED: {
      title: "Being prepared",
      detail: "The kitchen is working on your order.",
      emoji: "👨‍🍳",
    },
    READY: { title: "Ready", detail: "Your order is ready.", emoji: "🔔" },
    COMPLETED: { title: "Served", detail: "Enjoy your meal.", emoji: "🍽️" },
    REJECTED: {
      title: "Not accepted",
      detail: "The restaurant could not take this order.",
      emoji: "😔",
    },
  };

export function StatusCard({
  trackToken,
  initialStatus,
  initialRejectionReason,
  createdAt,
  orderNumber,
  tableLabel,
  children,
}: {
  trackToken: string;
  initialStatus: TrackStatus;
  initialRejectionReason: string | null;
  createdAt: string;
  orderNumber: number;
  tableLabel: string | null;
  /**
   * The order summary, rendered on the server and passed through: it
   * never changes, so it stays out of the client bundle while still
   * sitting between the rail and the footnote below.
   */
  children?: React.ReactNode;
}) {
  const { status, rejectionReason } = useLiveOrderStatus(trackToken, {
    status: initialStatus,
    rejectionReason: initialRejectionReason,
  });

  const copy = STATUS_COPY[status];
  const isOpen = status === "PENDING" || status === "ACCEPTED";
  const isRejected = status === "REJECTED";

  // A diner is usually not staring at the screen, so a change that
  // arrives silently is a change they miss. Vibrate if the device
  // supports it — this needs no permission prompt, unlike sound, and is
  // the right register for "your food is ready" on a phone on a table.
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current === status) return;
    previous.current = status;
    try {
      navigator.vibrate?.(status === "READY" ? [120, 60, 120] : 80);
    } catch {
      // Not supported, or blocked without a prior interaction. The
      // visible change is the alert that matters.
    }
  }, [status]);

  return (
    <>
      <div
        className={`rounded-2xl border p-6 text-center shadow-sm transition-colors ${
          isRejected ? "border-red-200 bg-red-50" : "border-zinc-200 bg-white"
        }`}
        // Announced to a screen reader when it changes, rather than
        // updating silently underneath someone who cannot see it.
        aria-live="polite"
      >
        <span className="text-5xl" aria-hidden>
          {copy.emoji}
        </span>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900">
          {copy.title}
        </h1>
        <p className="mt-1 text-zinc-600">{copy.detail}</p>

        <p className="mt-4 text-sm text-zinc-500">
          Order #{orderNumber}
          {tableLabel && ` · Table ${tableLabel}`}
        </p>

        {/* Only while it is still cooking: once served, how long it took
            stops being the useful number. */}
        {isOpen && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700">
            <span aria-hidden>⏱</span>
            <ElapsedTime since={createdAt} />
          </p>
        )}

        {isRejected && rejectionReason && (
          <p className="mt-4 rounded-lg bg-white px-4 py-3 text-sm text-red-800">
            {rejectionReason}
          </p>
        )}
      </div>

      {!isRejected && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <ProgressRail status={status} />
        </div>
      )}

      {children}

      {isOpen && (
        <p className="mt-6 text-center text-xs text-zinc-400">
          This page updates on its own — no need to refresh.
        </p>
      )}
    </>
  );
}
