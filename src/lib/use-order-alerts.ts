"use client";

import { useCallback, useSyncExternalStore } from "react";
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

export function useOrderAlerts() {
  const { isArmed, arm, play } = useOrderSound();

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

  const showNotification = useCallback((order: SerializedOrder) => {
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
  }, []);

  /**
   * Announce a new order. This is what goes to `useLiveOrders`'
   * `onNewOrder`, which passes the order that arrived.
   */
  const announce = useCallback(
    (order: SerializedOrder) => {
      play();
      showNotification(order);
    },
    [play, showNotification],
  );

  /** One click that turns on both, for a single "enable alerts" button. */
  const enableAll = useCallback(async () => {
    await arm();
    await enableNotifications();
  }, [arm, enableNotifications]);

  return {
    announce,
    // Sound
    isSoundArmed: isArmed,
    armSound: arm,
    // Notifications
    notificationPermission: permission,
    enableNotifications,
    // Both
    enableAll,
    /** True once nothing further is needed from the staff. */
    isFullyArmed: isArmed && (permission === "granted" || permission === "unsupported"),
  };
}
