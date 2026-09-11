import { describe, expect, it } from "vitest";
import { translator, type MessageKey } from "../dictionary";
import { LOCALES, isSupportedLocale, resolveLocale } from "../locales";

/**
 * Choosing a language, and rendering in it.
 *
 * The failure that matters here is a half-translated menu: a guest who
 * picks Bengali and gets Bengali buttons with English labels in between
 * is worse served than one who gets consistent English. So the tests
 * check completeness, not just that translation happens at all.
 */

describe("resolveLocale", () => {
  it("honours what the guest explicitly chose", () => {
    expect(resolveLocale({ chosen: "bn", offered: ["en", "bn"], fallback: "en" })).toBe(
      "bn",
    );
  });

  it("ignores a choice the restaurant does not offer", () => {
    // A preference carried over from another restaurant must not blank
    // out this one's menu.
    expect(resolveLocale({ chosen: "bn", offered: ["en"], fallback: "en" })).toBe("en");
  });

  it("falls back to the browser's language when nothing was chosen", () => {
    expect(
      resolveLocale({
        browser: ["bn-BD", "en-US"],
        offered: ["en", "bn"],
        fallback: "en",
      }),
    ).toBe("bn");
  });

  it("matches a regional browser tag against the base language", () => {
    // "bn-BD" and "bn-IN" are both Bengali as far as the menu cares.
    expect(
      resolveLocale({ browser: ["bn-IN"], offered: ["en", "bn"], fallback: "en" }),
    ).toBe("bn");
  });

  it("takes the browser's languages in priority order", () => {
    expect(
      resolveLocale({ browser: ["en-GB", "bn"], offered: ["en", "bn"], fallback: "bn" }),
    ).toBe("en");
  });

  it("uses the restaurant's default when the browser asks for nothing it offers", () => {
    expect(
      resolveLocale({ browser: ["fr-FR"], offered: ["en", "bn"], fallback: "bn" }),
    ).toBe("bn");
  });

  it("falls back to the first offered language when even the default is not offered", () => {
    // A restaurant that removed its default language from the list.
    expect(resolveLocale({ offered: ["bn"], fallback: "en" })).toBe("bn");
  });
});

describe("isSupportedLocale", () => {
  it("accepts a language the app has strings for", () => {
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("bn")).toBe(true);
  });

  it("rejects anything else", () => {
    // Guards a stored preference and a submitted form value alike: an
    // unknown code would render a menu of empty buttons.
    expect(isSupportedLocale("fr")).toBe(false);
    expect(isSupportedLocale("")).toBe(false);
    expect(isSupportedLocale("en-US")).toBe(false);
  });
});

describe("translator", () => {
  it("renders a plain string", () => {
    expect(translator("en")("order")).toBe("Order");
    expect(translator("bn")("order")).toBe("অর্ডার");
  });

  it("fills placeholders", () => {
    expect(translator("en")("orderCount", { count: 2, total: "£18.00" })).toBe(
      "Order 2 for £18.00",
    );
  });

  it("lets a language put the placeholders in its own order", () => {
    // The reason interpolation lives in the dictionary rather than at
    // the call site: word order differs between languages.
    const rendered = translator("bn")("orderCount", { count: 2, total: "৳১৮০" });
    expect(rendered).toContain("2");
    expect(rendered).toContain("৳১৮০");
    expect(rendered).not.toContain("{");
  });

  it("leaves an unknown placeholder alone rather than printing undefined", () => {
    expect(translator("en")("orderCount", { count: 2 })).toContain("{total}");
  });

  it("falls back to English for an unknown locale", () => {
    expect(translator("fr")("order")).toBe("Order");
  });

  it("actually translates every string, in every language", () => {
    // The half-translated menu this whole suite exists to prevent.
    //
    // TypeScript already requires each language to define every key, so
    // a *missing* one cannot compile. What it cannot catch is a key
    // copied across untranslated — which is why this compares against
    // English rather than merely checking for a non-empty string.
    const keys: MessageKey[] = [
      "popular",
      "favourites",
      "noItems",
      "order",
      "dineIn",
      "takeaway",
      "delivery",
      "total",
      "addNote",
      "whenReady",
      "fillAllFields",
      "placeOrder",
      "nothingToOrder",
      "orderPlaced",
      "keepBrowsing",
      "trackIt",
      "offline",
      "couldNotPlace",
    ];

    const english = translator("en");

    for (const locale of LOCALES) {
      if (locale.code === "en") continue;
      const t = translator(locale.code);

      for (const key of keys) {
        expect(t(key), `${locale.code} "${key}" is still English`).not.toBe(english(key));
      }
    }
  });
});
