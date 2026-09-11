"use client";

import { useEffect, useState } from "react";

export type TrackStatus = "PENDING" | "ACCEPTED" | "READY" | "COMPLETED" | "REJECTED";

interface TrackState {
  status: TrackStatus;
  rejectionReason: string | null;
}

const OPEN: TrackStatus[] = ["PENDING", "ACCEPTED"];

/** How often to ask, while the order is still open. */
const POLL_MS = 5_000;

/**
 * Keeps the tracking page's status current without a page reload.
 *
 * This replaces a `<meta http-equiv="refresh">`, which did not work:
 * React renders that tag into the head after hydration, and browsers
 * ignore a meta-refresh inserted by script. Even where it did fire it
 * was a full navigation — a white flash, a scroll jump, and a restarted
 * elapsed-time counter every fifteen seconds.
 *
 * Three things keep the poll cheap. It stops for good once the order
 * reaches a final status, because nothing can change after that. It
 * pauses while the tab is hidden — a phone in a pocket must not poll
 * every five seconds for an hour — and asks once immediately on wake,
 * so the diner sees the truth the moment they look at the screen. And a
 * failed request is simply ignored: a flaky restaurant wifi should show
 * the last known status, not an error page.
 */
export function useLiveOrderStatus(trackToken: string, initial: TrackState): TrackState {
  const [state, setState] = useState<TrackState>(initial);

  useEffect(() => {
    if (!OPEN.includes(state.status)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/orders/${encodeURIComponent(trackToken)}/status`,
          { cache: "no-store" },
        );
        if (!response.ok || cancelled) return;

        const data = (await response.json()) as Partial<TrackState>;
        if (cancelled || !data.status) return;

        setState({
          status: data.status,
          rejectionReason: data.rejectionReason ?? null,
        });
      } catch {
        // Offline or a dropped connection. The next tick tries again;
        // the screen keeps showing what it last knew.
      }
    };

    const schedule = () => {
      timer = setTimeout(async () => {
        if (document.visibilityState === "visible") await poll();
        if (!cancelled) schedule();
      }, POLL_MS);
    };

    // Catch up immediately when the diner returns to the tab, rather
    // than making them wait out a tick that was skipped while hidden.
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    schedule();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [trackToken, state.status]);

  return state;
}
