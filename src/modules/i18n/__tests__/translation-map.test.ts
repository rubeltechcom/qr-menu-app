import { describe, expect, it } from "vitest";
import { buildTranslationMap } from "../translation-map";
import type { TranslationRow } from "../translation.repository";

/**
 * Applying a restaurant's own translations to its menu.
 *
 * The rule that matters is the one for missing data. A menu is only ever
 * partly translated — an owner adds Bengali names for their popular
 * dishes first and works down — so "no translation" has to mean "show
 * the original", never "show nothing". A blank dish name on a live menu
 * is worse than an untranslated one.
 */

const row = (
  entityId: string,
  field: string,
  value: string,
  locale = "bn",
): TranslationRow => ({ entityType: "menuItem", entityId, field, locale, value });

describe("buildTranslationMap", () => {
  it("returns the translation when there is one", () => {
    const map = buildTranslationMap([row("dish-1", "name", "চিকেন বিরিয়ানি")]);
    expect(map.get("dish-1", "name", "Chicken Biryani")).toBe("চিকেন বিরিয়ানি");
  });

  it("falls back to the original when a dish is untranslated", () => {
    const map = buildTranslationMap([row("dish-1", "name", "চিকেন বিরিয়ানি")]);
    expect(map.get("dish-2", "name", "Fish Curry")).toBe("Fish Curry");
  });

  it("falls back per field, not per dish", () => {
    // A name translated but no description is the normal half-finished
    // state; the description must still render in the original.
    const map = buildTranslationMap([row("dish-1", "name", "চিকেন বিরিয়ানি")]);
    expect(map.get("dish-1", "name", "Chicken Biryani")).toBe("চিকেন বিরিয়ানি");
    expect(map.get("dish-1", "description", "Slow-cooked rice")).toBe("Slow-cooked rice");
  });

  it("ignores a blank stored value rather than blanking the dish", () => {
    // Rows are deleted rather than blanked, but bad data must not be
    // able to empty a menu.
    const map = buildTranslationMap([row("dish-1", "name", "   ")]);
    expect(map.get("dish-1", "name", "Chicken Biryani")).toBe("Chicken Biryani");
  });

  it("handles an empty translation set", () => {
    const map = buildTranslationMap([]);
    expect(map.get("dish-1", "name", "Chicken Biryani")).toBe("Chicken Biryani");
    expect(map.size).toBe(0);
  });

  it("does not let one dish's translation leak onto another", () => {
    const map = buildTranslationMap([
      row("dish-1", "name", "এক"),
      row("dish-2", "name", "দুই"),
    ]);
    expect(map.get("dish-1", "name", "One")).toBe("এক");
    expect(map.get("dish-2", "name", "Two")).toBe("দুই");
    expect(map.get("dish-3", "name", "Three")).toBe("Three");
  });
});
