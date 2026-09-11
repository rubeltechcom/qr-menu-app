import { getBooleanSetting, getSetting } from "./settings.service";

/**
 * How a new order announces itself, as the operator configured it.
 *
 * Resolved on the server and handed to the staff screens, so both the
 * kitchen and the floor behave the same way and neither reaches into
 * settings itself.
 *
 * What this cannot do is grant permission. Browsers require each device
 * to allow sound and notifications through a real user gesture — no
 * server setting can bypass that, and pretending otherwise would mean a
 * silent kitchen with a panel claiming sound was on. These settings
 * decide what happens once a device has granted it.
 */
export interface AlertSettings {
  soundEnabled: boolean;
  /** Falls back to the bundled chime. */
  soundUrl: string;
  /** 0 plays once; anything higher re-plays while an order waits. */
  repeatSeconds: number;
  desktopNotifications: boolean;
}

const DEFAULT_SOUND = "/sounds/new-order.wav";
const MAX_REPEAT_SECONDS = 300;

function clampSeconds(raw: string | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.round(value), MAX_REPEAT_SECONDS);
}

export function alertSettings(): AlertSettings {
  return {
    soundEnabled: getBooleanSetting("alerts.soundEnabled", true),
    soundUrl: getSetting("alerts.soundUrl")?.trim() || DEFAULT_SOUND,
    // Read here rather than through getNumberSetting, which treats 0 as
    // "unset" and falls back — but 0 is the meaningful default here,
    // and means "play once". Capped at five minutes: a sound repeating
    // every second is not an alert, it is a reason to mute the speakers.
    repeatSeconds: clampSeconds(getSetting("alerts.repeatSeconds")),
    desktopNotifications: getBooleanSetting("alerts.desktopNotifications", true),
  };
}
