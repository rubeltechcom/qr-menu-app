import { describe, expect, it } from "vitest";
import { scopeKey, type StorefrontScope } from "../scope";

/**
 * The storage namespace a guest's cart, language, favourites and active
 * order all hang off.
 *
 * Worth testing for something this small because the failure it prevents
 * is silent and happens on the guest's own phone: two storefronts
 * sharing one key means a grocer's basket appearing inside a tea stall's
 * menu, with no error anywhere to explain it.
 */

describe("scopeKey", () => {
  it("namespaces a table by its public code", () => {
    expect(scopeKey({ kind: "table", publicCode: "AB12CD34" })).toBe("table:AB12CD34");
  });

  it("namespaces a shop by its slug", () => {
    expect(scopeKey({ kind: "shop", slug: "cha-stall" })).toBe("shop:cha-stall");
  });

  it("keeps two shops apart", () => {
    expect(scopeKey({ kind: "shop", slug: "cha-stall" })).not.toBe(
      scopeKey({ kind: "shop", slug: "rubel-furniture" }),
    );
  });

  /**
   * The reason the prefix exists. A publicCode and a slug are each
   * unique within their own table, but nothing stops a shop being called
   * the same string as some restaurant's table code — and without the
   * prefix those two would share a cart.
   */
  it("keeps a shop apart from a table that shares its identifier", () => {
    const table: StorefrontScope = { kind: "table", publicCode: "AB12CD34" };
    const shop: StorefrontScope = { kind: "shop", slug: "AB12CD34" };

    expect(scopeKey(table)).not.toBe(scopeKey(shop));
  });
});
