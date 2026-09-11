"use client";

import { useEffect, useState } from "react";

/**
 * How long the order has been in, counting up.
 *
 * Rendered on the client because it depends on "now": the server would
 * ship a number that is wrong by the time it reaches the phone, and
 * stale by the second after that.
 *
 * Mounts showing nothing rather than a server-rendered zero, so the
 * first paint cannot disagree with the HTML that was sent.
 */
export function ElapsedTime({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      const seconds = Math.max(
        0,
        Math.floor((Date.now() - new Date(since).getTime()) / 1000),
      );
      const minutes = Math.floor(seconds / 60);

      // Under a minute the seconds matter — it is the reassuring part.
      // After that they are noise, and a minute counter is calmer to
      // watch while waiting for food.
      setElapsed(
        minutes < 1
          ? `${seconds}s`
          : minutes < 60
            ? `${minutes} min`
            : `${Math.floor(minutes / 60)}h ${minutes % 60}m`,
      );
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [since]);

  if (elapsed === null) return null;

  return <span className="tabular-nums">{elapsed}</span>;
}

/**
 * The four steps an order moves through, as a progress rail.
 *
 * A rejected order gets its own treatment upstream rather than a broken
 * rail with one red segment.
 */
const STEPS = [
  { key: "PENDING", label: "Sent" },
  { key: "ACCEPTED", label: "Cooking" },
  { key: "READY", label: "Ready" },
  { key: "COMPLETED", label: "Served" },
] as const;

export function ProgressRail({ status }: { status: string }) {
  const currentIndex = STEPS.findIndex((step) => step.key === status);

  return (
    <ol className="flex items-start gap-1">
      {STEPS.map((step, index) => {
        const isDone = index <= currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <li key={step.key} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex w-full items-center">
              {/* The rail either side of the dot, so the line runs
                  edge to edge rather than stopping at each label. */}
              <span
                className={`h-1 flex-1 rounded-full ${
                  index === 0 ? "bg-transparent" : isDone ? "bg-green-500" : "bg-zinc-200"
                }`}
              />
              <span
                className={`h-3 w-3 shrink-0 rounded-full transition-colors ${
                  isCurrent
                    ? "bg-green-500 ring-4 ring-green-100"
                    : isDone
                      ? "bg-green-500"
                      : "bg-zinc-300"
                }`}
              />
              <span
                className={`h-1 flex-1 rounded-full ${
                  index === STEPS.length - 1
                    ? "bg-transparent"
                    : index < currentIndex
                      ? "bg-green-500"
                      : "bg-zinc-200"
                }`}
              />
            </div>

            <span
              className={`text-center text-xs ${
                isCurrent
                  ? "font-semibold text-zinc-900"
                  : isDone
                    ? "text-zinc-600"
                    : "text-zinc-400"
              }`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
