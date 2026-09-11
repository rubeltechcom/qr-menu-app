"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalStorageState } from "@/lib/use-local-storage";

const STORAGE_KEY = "qrmenu.sound-enabled";
const DEFAULT_SOUND_URL = "/sounds/new-order.wav";

/**
 * The audible new-order alert, and the one-click gesture that arms it.
 *
 * Browsers refuse `audio.play()` until the user has interacted with the
 * page — which is why the reference product shows a "Click here to
 * enable sound" link rather than just playing. The click below plays the
 * clip muted and immediately rewinds it: that single gesture satisfies
 * the autoplay policy, so every later programmatic play is allowed.
 *
 * The choice is remembered, so staff arm it once rather than every
 * shift. It is remembered per browser, which is correct — the permission
 * itself is per browser.
 */
/** `soundUrl` lets the operator replace the chime from /admin/settings. */
export function useOrderSound(soundUrl?: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isArmed, setIsArmed] = useState(false);

  // Read hydration-safely: false on the server and on first paint, the
  // stored preference thereafter, with no setState inside an effect.
  const [storedPreference, setStoredPreference] = useLocalStorageState<boolean>(
    STORAGE_KEY,
    false,
    (raw) => raw === "true",
  );

  useEffect(() => {
    const audio = new Audio(soundUrl || DEFAULT_SOUND_URL);
    audio.preload = "auto";
    audioRef.current = audio;

    return () => {
      audio.pause();
      audioRef.current = null;
    };
    // Rebuilt when the operator changes the sound, so a new chime takes
    // effect without staff reloading the tablet.
  }, [soundUrl]);

  /**
   * Call from a real user gesture (a click). Playing muted and rewinding
   * is what unlocks the element without the staff hearing a stray chime
   * at the moment they press the link.
   */
  const arm = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return false;

    try {
      audio.muted = true;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;

      setIsArmed(true);
      setStoredPreference(true);
      return true;
    } catch {
      audio.muted = false;
      return false;
    }
  }, [setStoredPreference]);

  /**
   * A browser that already granted autoplay (the staff armed it on a
   * previous visit) will play without a gesture. Try quietly on mount so
   * a returning kitchen tab is audible immediately; if the browser says
   * no, the enable link is still shown.
   */
  useEffect(() => {
    if (!storedPreference || isArmed) return;
    let cancelled = false;

    void (async () => {
      const audio = audioRef.current;
      if (!audio) return;
      try {
        audio.muted = true;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        if (!cancelled) setIsArmed(true);
      } catch {
        audio.muted = false;
        // Leave isArmed false — the link stays visible.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storedPreference, isArmed]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !isArmed) return;
    // Rewind first: a second order arriving mid-chime should restart the
    // alert, not be swallowed because the element is already playing.
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Autoplay revoked (e.g. tab moved to a new window). Fall back to
      // showing the enable link again rather than failing silently.
      setIsArmed(false);
    });
  }, [isArmed]);

  return { isArmed, arm, play };
}
