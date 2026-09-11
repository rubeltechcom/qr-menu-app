/**
 * The languages a restaurant can offer its guests.
 *
 * Deliberately a short list rather than every language with a
 * translation API behind it: each one here has real, checked UI strings
 * (see dictionary.ts), and shipping a language whose buttons are half
 * English is worse than not offering it.
 *
 * Adding one means adding its strings to the dictionary — the type
 * system enforces that, so a locale cannot be listed here and then
 * silently fall back to English everywhere.
 */

export const LOCALES = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", dir: "ltr" },
] as const;

export type LocaleCode = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: LocaleCode = "en";

/** Every code, for validating stored values. */
export const LOCALE_CODES: readonly string[] = LOCALES.map((locale) => locale.code);

export function isSupportedLocale(value: string): value is LocaleCode {
  return LOCALE_CODES.includes(value);
}

export function localeInfo(code: string) {
  return LOCALES.find((locale) => locale.code === code) ?? LOCALES[0];
}

/**
 * The best locale for a guest, given what the restaurant offers.
 *
 * Order of preference: what the guest explicitly chose, then what their
 * browser asks for, then the restaurant's own default. A guest whose
 * language the restaurant does not offer sees the restaurant's default
 * rather than an empty menu.
 */
export function resolveLocale(params: {
  chosen?: string | null;
  browser?: readonly string[];
  offered: readonly string[];
  fallback: string;
}): string {
  const { chosen, browser = [], offered, fallback } = params;

  if (chosen && offered.includes(chosen)) return chosen;

  for (const candidate of browser) {
    // "bn-BD" should match an offered "bn".
    const base = candidate.split("-")[0]?.toLowerCase();
    if (base && offered.includes(base)) return base;
  }

  if (offered.includes(fallback)) return fallback;
  return offered[0] ?? DEFAULT_LOCALE;
}
