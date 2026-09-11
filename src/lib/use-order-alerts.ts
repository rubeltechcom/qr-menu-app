"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { SerializedOrder } from "@/modules/orders/order.service";
import { useOrderSound } from "@/lib/use-order-sound";

/**
 * How a new order announces itself: a chime and a desktop notification.
 *
 * Both exist because neither is sufficient alone. A kitchen tablet is
 * often muted, or the tab is behind a rota spreadsheet; a notification
 * covers the first case and the sound covers the second, where nobody is
 * looking at the screen at all.
 *
 * Both also need a user gesture before a browser will allow them, which
 * is why this returns `arm` and `enableNotifications` for the screen to
 * hang a visible control on rather than trying to be clever on mount.
 */

const TYPE_LABEL: Record<SerializedOrder["type"], string> = {
  DINE_IN: "DINE IN",
  TAKEAWAY: "TAKEAWAY",
  DELIVERY: "DELIVERY",
};

export type NotificationState = "unsupported" | "default" | "granted" | "denied";

function currentPermission(): NotificationState {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission as NotificationState;
}

/**
 * Permission is browser state, not React state, and it changes from
 * outside React — the staff can grant or revoke it in the address bar
 * without the page knowing. Subscribers are notified after we request
 * it; anything else is picked up on the next render.
 */
const permissionListeners = new Set<() => void>();

function notifyPermissionChanged() {
  for (const listener of permissionListeners) listener();
}

/**
 * What the operator configured in /admin/settings.
 *
 * Optional so the hook still works where no settings are passed — the
 * defaults match the behaviour before these were configurable.
 */
export interface AlertPreferences {
  soundEnabled?: boolean;
  soundUrl?: string;
  repeatSeconds?: number;
  desktopNotifications?: boolean;
}

export function useOrderAlerts(preferences: AlertPreferences = {}) {
  const {
    soundEnabled = true,
    soundUrl,
    repeatSeconds = 0,
    desktopNotifications = true,
  } = preferences;

  const { isArmed, arm, play } = useOrderSound(soundUrl);

  const subscribe = useCallback((onChange: () => void) => {
    permissionListeners.add(onChange);
    return () => {
      permissionListeners.delete(onChange);
    };
  }, []);

  // Read during render rather than synced into state by an effect: the
  // server snapshot matches the HTML that was sent, and the client
  // snapshot is right on first paint. Same approach, and the same
  // reason, as useLocalStorageState.
  const permission = useSyncExternalStore(
    subscribe,
    currentPermission,
    () => "unsupported" as NotificationState,
  );

  /**
   * Ask for notification permission. Must be called from a click: every
   * current browser ignores — and some permanently penalise — a request
   * that does not come from a user gesture.
   */
  const enableNotifications = useCallback(async () => {
    if (typeof Notification === "undefined") return false;
    try {
      const result = await Notification.requestPermission();
      notifyPermissionChanged();
      return result === "granted";
    } catch {
      return false;
    }
  }, []);

  const showNotification = useCallback(
    (order: SerializedOrder) => {
      // Turned off by the operator, so do not ask and do not show.
      if (!desktopNotifications) return;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        return;
      }
      try {
        new Notification("New order received", {
          body: `${TYPE_LABEL[order.type]} #${order.orderNumber}`,
          // The order id, so a re-sync that re-reports the same order
          // replaces the existing popup instead of stacking a duplicate.
          tag: order.id,
          requireInteraction: false,
        });
      } catch {
        // Some browsers only allow Notification from a service worker.
        // The chime and the on-screen card still do their job.
      }
    },
    [desktopNotifications],
  );

  /**
   * Announce a new order. This is what goes to `useLiveOrders`'
   * `onNewOrder`, which passes the order that arrived.
   */
  const announce = useCallback(
    (order: SerializedOrder) => {
      if (soundEnabled) play();
      showNotification(order);
    },
    [soundEnabled, play, showNotification],
  );

  /**
   * Keep sounding while an order sits unaccepted.
   *
   * For a kitchen loud enough that one chime is missed. Driven by the
   * caller passing the number of orders still waiting, so it stops as
   * soon as the queue is cleared rather than running on a timer nobody
   * remembered to cancel.
   */
  const [waitingCount, setWaitingCount] = useState(0);

  useEffect(() => {
    if (!soundEnabled || repeatSeconds <= 0 || waitingCount === 0 || !isArmed) {
      return;
    }
    const timer = setInterval(() => play(), repeatSeconds * 1000);
    return () => clearInterval(timer);
  }, [soundEnabled, repeatSeconds, waitingCount, isArmed, play]);

  /** One click that turns on both, for a single "enable alerts" button. */
  const enableAll = useCallback(async () => {
    if (soundEnabled) await arm();
    if (desktopNotifications) await enableNotifications();
  }, [soundEnabled, desktopNotifications, arm, enableNotifications]);

  return {
    announce,
    /** Tell the hook how many orders are still waiting, for the repeat. */
    setWaitingCount,
    // Sound
    isSoundArmed: isArmed,
    armSound: arm,
    // Notifications
    notificationPermission: permission,
    enableNotifications,
    // Both
    enableAll,
    /**
     * True once nothing further is needed from the staff — which
     * includes the case where the operator turned an alert off, since
     * there is then nothing left to grant.
     */
    isFullyArmed:
      (!soundEnabled || isArmed) &&
      (!desktopNotifications || permission === "granted" || permission === "unsupported"),
  };
}
