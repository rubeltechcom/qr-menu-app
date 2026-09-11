"use client";

import { useCallback, useMemo } from "react";
import { useLocalStorageState } from "@/lib/use-local-storage";
import { translator } from "@/modules/i18n/dictionary";
import { isSupportedLocale, resolveLocale } from "@/modules/i18n/locales";

/**
 * The language a guest is reading the menu in.
 *
 * Remembered on the device rather than in the URL: a diner who picks
 * Bengali once should not have to pick it again when they scan the next
 * table, and a QR code printed on a sticker cannot carry a preference
 * nobody has expressed yet.
 *
 * The stored value is scoped per restaurant, because the languages on
 * offer differ between them — a preference for a language this
 * restaurant does not serve has to fall back rather than blank the menu.
 */

function parseLocale(raw: string): string | null {
  return isSupportedLocale(raw) ? raw : null;
}

export function useLocale(params: {
  publicCode: string;
  /** What this restaurant offers, first being its default. */
  offered: string[];
  /** Its configured fallback. */
  fallback: string;
}) {
  const { publicCode, offered, fallback } = params;

  const [chosen, setChosen] = useLocalStorageState<string | null>(
    `qrmenu.locale.${publicCode}`,
    null,
    parseLocale,
  );

  const locale = useMemo(
    () =>
      resolveLocale({
        chosen,
        // Read at render rather than stored: a guest who changes their
        // phone's language should see that reflected.
        browser: typeof navigator === "undefined" ? [] : navigator.languages,
        offered,
        fallback,
      }),
    [chosen, offered, fallback],
  );

  const t = useMemo(() => translator(locale), [locale]);

  const setLocale = useCallback(
    (next: string) => {
      if (isSupportedLocale(next)) setChosen(next);
    },
    [setChosen],
  );

  return { locale, setLocale, t };
}
